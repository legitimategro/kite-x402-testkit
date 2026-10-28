import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Seller, encode } from "./seller.mjs";
import { Vault } from "./store.mjs";
export const scenarios = [
  "challenge",
  "valid",
  "invalid_signature",
  "wrong_network",
  "wrong_amount",
  "upstream_400",
  "upstream_500",
  "bad_json",
  "upstream_timeout",
  "connection_reset",
  "settlement_unknown",
  "lost_response",
  "duplicate_operation",
  "conflicting_operation",
  "replayed_payment",
];
export function assertions(observation) {
  const { events, status, scenario, repeat } = observation;
  const index = (x) => events.indexOf(x);
  const failures = [];
  const failedBusiness = [
    "upstream_400",
    "upstream_500",
    "bad_json",
    "upstream_timeout",
    "connection_reset",
  ].includes(scenario);
  if (
    index("settle") >= 0 &&
    (index("business_success") < 0 ||
      index("settle") < index("business_success"))
  )
    failures.push("settled_before_valid_business_result");
  if (
    index("business_start") >= 0 &&
    (index("verify") < 0 || index("business_start") < index("verify"))
  )
    failures.push("business_before_verification");
  if (failedBusiness && (status < 400 || index("settle") >= 0))
    failures.push("business_failure_charged_or_masked");
  if (
    ["wrong_network", "wrong_amount", "invalid_signature"].includes(scenario) &&
    status !== 402
  )
    failures.push("invalid_payment_accepted");
  if (scenario === "challenge" && status !== 402)
    failures.push("challenge_missing");
  if (scenario === "valid" && status !== 200)
    failures.push("valid_request_failed");
  if (
    scenario === "settlement_unknown" &&
    (status !== 503 || events.filter((e) => e === "settle").length !== 1)
  )
    failures.push("unknown_settlement_mishandled");
  if (repeat && repeat.status !== 409)
    failures.push("duplicate_or_conflict_not_rejected");
  if (events.filter((x) => x === "settle").length > 1)
    failures.push("settled_twice");
  return failures;
}
export async function runCase(scenario, { broken = false } = {}) {
  const events = [],
    folder = mkdtempSync(join(tmpdir(), "kite-faultlab-"));
  let mode = scenario;
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const b of req) text += b;
    const endpoint = req.url;
    events.push(endpoint.slice(1));
    if (endpoint === "/verify") {
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify(
          mode === "invalid_signature"
            ? { isValid: false }
            : { isValid: true, payer: "0x" + "a".repeat(40) },
        ),
      );
    }
    if (endpoint === "/settle") {
      if (mode === "settlement_unknown") {
        res.destroy();
        return;
      }
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify({
          success: true,
          network: "eip155:2368",
          transaction: "mock-receipt-no-chain-transaction",
        }),
      );
    }
    if (endpoint === "/business") {
      if (mode === "connection_reset") {
        res.destroy();
        return;
      }
      if (mode === "upstream_timeout") {
        const timer = setTimeout(() => res.end("{}"), 300);
        timer.unref();
        return;
      }
      res.statusCode =
        mode === "upstream_400" ? 400 : mode === "upstream_500" ? 500 : 200;
      res.setHeader("content-type", "application/json");
      return res.end(
        mode === "bad_json"
          ? "broken-json"
          : JSON.stringify({ output: "observed" }),
      );
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const endpoint = "http://127.0.0.1:" + server.address().port;
  const fetcher = async (url, options) =>
    fetch(endpoint + "/" + url.split("/").at(-1), options);
  const seller = new Seller({
    vault: new Vault(folder, randomBytes(32).toString("hex")),
    origin: "https://seller.example",
    network: "eip155:2368",
    asset: "0x" + "b".repeat(40),
    payTo: "0x" + "c".repeat(40),
    facilitator: "https://facilitator.example/v2",
    fetcher,
  });
  let status,
    repeat,
    payment = {
      x402Version: 2,
      resource: { url: "https://seller.example/v1/run" },
      accepted: structuredClone(seller.terms),
      payload: { signature: "mock-proof-" + scenario },
    };
  if (scenario === "wrong_network") payment.accepted.network = "eip155:1";
  if (scenario === "wrong_amount") payment.accepted.amount = "1";
  const input = { operation_id: "test-" + scenario, value: 1 };
  const prepare = async () => {
    events.push("business_start");
    if (broken) events.push("settle");
    let output;
    try {
      const response = await fetch(endpoint + "/business", {
        signal: AbortSignal.timeout(80),
      });
      if (!response.ok) throw Error();
      output = await response.json();
    } catch {
      throw Object.assign(Error("upstream_failure"), { status: 502 });
    }
    events.push("business_success");
    return output;
  };
  const request = async (value, proof) => {
    try {
      return await seller.purchase({
        path: "/v1/run",
        input: value,
        header: proof,
        prepare,
      });
    } catch (e) {
      return { status: e.status || 500, body: { error: e.code || e.message } };
    }
  };
  try {
    const result = await request(
      input,
      scenario === "challenge" ? null : encode(payment),
    );
    status = result.status;
    if (
      [
        "duplicate_operation",
        "conflicting_operation",
        "replayed_payment",
        "lost_response",
        "settlement_unknown",
      ].includes(scenario)
    ) {
      const next = { ...input };
      if (scenario === "conflicting_operation") next.value = 2;
      if (scenario === "replayed_payment") next.operation_id += "-new";
      repeat = await request(next, encode(payment));
    }
    const observed = {
      scenario,
      status,
      events,
      repeat: repeat ? { status: repeat.status } : null,
      evidence_source: "mock",
      evidence_level: "E1",
      actual_spend: false,
    };
    const failures = assertions(observed);
    return {
      ...observed,
      status: failures.length ? "failed" : "mock_pass",
      http_status: status,
      failures,
    };
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(folder, { recursive: true, force: true });
  }
}
export async function runSuite(options = {}) {
  const cases = [];
  for (const scenario of scenarios)
    cases.push(await runCase(scenario, options));
  return {
    schema_version: 1,
    profile: "offline",
    observed_at: new Date().toISOString(),
    cases,
    summary: {
      mock_pass: cases.filter((c) => c.status === "mock_pass").length,
      failed: cases.filter((c) => c.status === "failed").length,
      live_pass: 0,
      blocked: 0,
    },
    official_certification: false,
  };
}
const escape = (x) =>
  String(x)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
export function junit(report) {
  return `<testsuite name="x402-fault-lab" tests="${report.cases.length}" failures="${report.summary.failed}" skipped="${report.summary.blocked}">${report.cases.map((c) => `<testcase name="${escape(c.scenario)}">${c.status === "failed" ? `<failure>${escape(c.failures.join(", "))}</failure>` : c.status === "blocked" ? "<skipped/>" : ""}<system-out>${escape(c.status)}</system-out></testcase>`).join("")}</testsuite>`;
}
export function html(report) {
  return (
    '<!doctype html><meta charset="utf-8"><title>x402 Fault Lab</title><style>body{font:17px system-ui;max-width:1000px;margin:50px auto;background:#101820;color:#eff7fb}td,th{padding:12px;border-bottom:1px solid #456}code{color:#76dfbc}</style><h1>x402 Fault Lab</h1><p>' +
    escape(report.profile || "offline") +
    " evidence · no actual spend · no official certification</p><table><tr><th>Case</th><th>Result</th><th>Observed order</th></tr>" +
    report.cases
      .map(
        (c) =>
          `<tr><td>${escape(c.scenario)}</td><td>${escape(c.status)}</td><td><code>${escape((c.events || []).join(" → "))}</code></td></tr>`,
      )
      .join("") +
    "</table>"
  );
}
