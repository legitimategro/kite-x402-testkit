import test from "node:test";
import assert from "node:assert/strict";
import { runSuite, runCase, junit, html } from "./testkit.mjs";
test("all fault scenarios are explicit mock evidence", async () => {
  const r = await runSuite();
  assert.equal(r.summary.failed, 0);
  assert.equal(r.summary.mock_pass, 15);
  assert.equal(r.summary.live_pass, 0);
  assert(r.cases.every((c) => c.evidence_source === "mock" && !c.actual_spend));
  assert(junit(r).includes('tests="15"'));
  assert(html(r).includes("no actual spend"));
});
test("deliberately premature settlement implementation is caught", async () => {
  const r = await runCase("upstream_500", { broken: true });
  assert.equal(r.status, "failed");
  assert(r.failures.includes("settled_before_valid_business_result"));
});
