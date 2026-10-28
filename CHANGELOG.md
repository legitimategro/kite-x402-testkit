# Changes

## 0.2.0 — 2026-10-28

The external profile probes an independent HTTP endpoint, without importing its implementation: node src/main.mjs --profile external --config examples/external-profile.json. Configure target, input and payment (network, asset, payTo, amount in base units). The profile sends an unsigned request, intentionally malformed payment bytes, then another unsigned request. It checks the actual quote, rejection and stability. No valid proof is generated or payment sent. It reports external_http_unsigned / E1 and never increments live_pass. Use the same probe against the .NET example and the Node sellers. Offline fault ordering tests remain a separate profile; funded Passport and SIWX are still unverified.

This evaluation update retains explicit blocked real-payment, public-hosting and official-listing gates. Prior releases remain available.
