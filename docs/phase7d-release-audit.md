# Phase 7D — Production Release Audit

## Release-blocker audit

### Fixed in this increment

- **Auth refresh race** — multiple simultaneous authenticated requests near token expiry could each attempt a refresh-token exchange. The client now coalesces refresh attempts into one in-flight refresh and shares the result across callers.
- **Verbose backend error propagation** — the shared Supabase REST helper previously embedded the complete response body in thrown errors. Production exceptions now expose the HTTP status plus a bounded diagnostic message instead of arbitrary backend response bodies.
- **Production configuration validation** — Supabase URL/key configuration is validated before use with clearer failures.

### Verified existing safeguards

- API routes authenticate user access tokens before learner-owned reads/writes.
- Supabase REST calls use learner bearer tokens where user-scoped RLS is required.
- Shared REST requests are `no-store`.
- Auth sessions automatically refresh before expiry and retry once after a 401.
- CI runs type-check, Next production build, Cloudflare bundle build, and browser certification.
- PWA manifest defines standalone display, theme/background colors, education/productivity categories, and a deterministic start URL.
- Mobile navigation, safe-area handling, accessibility status/error states, and reduced-motion behavior are covered by browser certification.

## Non-blocking follow-up

- Moving refresh tokens from localStorage to HttpOnly same-site cookies would further reduce XSS token-exfiltration exposure, but requires an auth architecture change rather than a release patch. Keep CSP/XSS prevention strict until that migration is planned.
- Add centralized structured observability with request correlation IDs before larger-scale commercial rollout.
- Add synthetic production health checks after deployment so Cloudflare/runtime regressions are detected outside CI.

## Release decision

This phase is considered release-ready only after the hardening PR passes both production validation and the complete desktop/mobile browser certification suite.