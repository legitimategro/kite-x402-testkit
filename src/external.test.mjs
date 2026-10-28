import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { probeTarget } from "./external.mjs";
test("independent HTTP endpoint is tested without a valid signature or charge", async (t) => {
  const payment = {
    network: "eip155:2368",
    asset: "0x" + "a".repeat(40),
    payTo: "0x" + "b".repeat(40),
    amount: "10000",
  };
  let url;
  const signatures = [];
  const server = createServer(async (req, res) => {
    for await (const b of req) {
    }
    signatures.push(req.headers["payment-signature"]);
    res.setHeader("content-type", "application/json");
    res.statusCode = req.headers["payment-signature"] ? 400 : 402;
    res.end(
      JSON.stringify(
        req.headers["payment-signature"]
          ? { error: "invalid_payment" }
          : {
              x402Version: 2,
              resource: { url },
              accepts: [{ scheme: "exact", ...payment }],
            },
      ),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  url = "http://127.0.0.1:" + server.address().port + "/paid";
  const r = await probeTarget({
    target: url,
    input: { operation_id: "external-test" },
    payment,
  });
  assert.equal(r.summary.failed, 0);
  assert.equal(r.summary.live_pass, 0);
  assert.equal(r.summary.unsigned_http_pass, 3);
  assert.deepEqual(signatures, [undefined, "not-valid-base64-json", undefined]);
  const wrong = await probeTarget({
    target: url,
    input: { operation_id: "external-test" },
    payment: { ...payment, amount: "20000" },
  });
  assert(wrong.summary.failed > 0);
});
