# x402 Fault Lab

Deterministic seller fault injection and evidence reports.

Version 0.1.0 is an AI-assisted engineering evaluation release, developed under one operator and assigned to this GitHub account. It is not evidence of independent human adoption, official Kite approval, Electric Capital inclusion or successful live payment.

## Run and verify

Node.js 20.11+ is required.

```sh
npm ci
npm test
node src/main.mjs --profile offline
# Intentional broken implementation should fail:
node src/main.mjs --profile offline --broken-reference
```

The offline runner drives the seller core with a local facilitator fixture and controlled business outcomes. Fifteen scenarios cover challenge, valid purchase, invalid signature, wrong network/amount, upstream 4xx/5xx, invalid JSON, timeout/reset, lost response, settlement uncertainty, replay and conflicting idempotency. A deliberately broken ordering implementation must fail.

reports/report.json, junit.xml and report.html preserve evidence_source=mock, E1 and actual_spend=false. No synthetic receipt is presented as a transaction. The module exports runSuite, runCase and assertions for integration in other test harnesses.

Live mode reports BLOCKED unless a real execution/evidence adapter is supplied by an integrator; v0.1 does not send a live purchase. It is not official certification and does not replace the Passport Skills runner.

## Configuration and recovery

The stored payment state UNKNOWN never means unpaid. Inspect the original receipt/activity and restricted journal; do not change an operation key to buy again. Where a writer lock survives a crash, stop all writer processes and review the journal before removing only the stale lock directory.

## Integration evidence

Read [compatibility.json](compatibility.json) and [the protocol boundary](docs/PROTOCOL.md). Local tests are E1; read-only public capability/RPC observations prove only the facts observed. Real Passport approval, funded purchase, SIWX interoperability, public deployment and catalog/EC review are not completed by this release. 

## Scope and evidence

[Original PRD](docs/PRD.md) describes the full target, not a claim that every external acceptance gate has passed. [Event contract](docs/EVENTS.md) defines the application records. The standalone repositories share protocol/storage support code, with distinct business implementations and tests. The license is MIT; third-party dependencies keep their upstream licenses. Reproduce failures without publishing payment signatures, account credentials or private files.
