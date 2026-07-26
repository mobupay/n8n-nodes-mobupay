# Changelog

## 1.0.0 — 2026-07-23

Initial release.

- **Mobupay** node: Payment Link > Create (idempotent, minor units EUR/XPF),
  Payment > Get, Payment > Refund (full or partial).
- **Mobupay Trigger** node: verified webhook events (HMAC-SHA256 V2 signature
  on the raw body, 5 min anti-replay window), event type subscription.
- **Mobupay API** credentials: API key (Bearer), account webhook secret,
  credential test against the API.
- No runtime dependencies. npm publishing via GitHub Actions with provenance
  (npm Trusted Publishers).
