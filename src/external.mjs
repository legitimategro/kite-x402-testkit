import { fault, hash } from "./store.mjs";

// Only unsigned challenges and intentionally malformed payment bytes are sent.
// This profile cannot assert settlement, SIWX or funded Passport interoperability.
export async function probeTarget({ target, input, payment, fetcher = fetch }) {
  const url = new URL(target);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw fault("target_https_required");
  if (
    !input?.operation_id ||
    !payment ||
    !["eip155:2366", "eip155:2368"].includes(payment.network) ||
    !/^0x[0-9a-f]{40}$/i.test(payment.asset || "") ||
    !/^0x[0-9a-f]{40}$/i.test(payment.payTo || "") ||
    !/^[1-9]\d*$/.test(payment.amount || "")
  )
    throw fault("external_profile_required");
  const request = async (headers) => {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(input),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const reader = response.body.getReader();
    let text = "",
      bytes = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 1048576) {
        await reader.cancel();
        throw fault("target_response_limit");
      }
      text += Buffer.from(value).toString();
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { status: response.status, data };
  };
  const first = await request({});
  const terms = first.data?.accepts?.[0];
  const valid =
    first.status === 402 &&
    first.data?.x402Version === 2 &&
    first.data?.resource?.url === url.href &&
    terms?.scheme === "exact" &&
    terms?.network === payment.network &&
    terms?.asset?.toLowerCase() === payment.asset.toLowerCase() &&
    terms?.payTo?.toLowerCase() === payment.payTo.toLowerCase() &&
    terms?.amount === payment.amount;
  const invalid = await request({
    "payment-signature": "not-valid-base64-json",
  });
  const repeated = await request({});
  const cases = [
    {
      scenario: "external_challenge",
      status: valid ? "passed" : "failed",
      failures: valid ? [] : ["advertised_quote_mismatch"],
    },
    {
      scenario: "external_malformed_payment",
      status: [400, 401, 402].includes(invalid.status) ? "passed" : "failed",
      failures: [400, 401, 402].includes(invalid.status)
        ? []
        : ["malformed_payment_not_rejected"],
    },
    {
      scenario: "external_quote_stability",
      status:
        repeated.status === 402 &&
        hash(repeated.data?.accepts || []) === hash(first.data?.accepts || [])
          ? "passed"
          : "failed",
      failures:
        repeated.status === 402 &&
        hash(repeated.data?.accepts || []) === hash(first.data?.accepts || [])
          ? []
          : ["unsigned_quote_changed"],
    },
  ].map((c) => ({
    ...c,
    evidence_source: "external_http_unsigned",
    evidence_level: "E1",
    actual_spend: false,
  }));
  return {
    profile: "external",
    target: url.href,
    observed_at: new Date().toISOString(),
    cases,
    summary: {
      failed: cases.filter((c) => c.status === "failed").length,
      blocked: 0,
      live_pass: 0,
      mock_pass: 0,
      unsigned_http_pass: cases.filter((c) => c.status === "passed").length,
    },
    funded_interoperability: "NOT_TESTED",
  };
}
