# Phase 8 — Production Launch Readiness

## Current status

Launch decision: **NO-GO until live deployment acceptance is completed.**

## Production backend baseline

- Supabase project: `Erpedu` (`nfgmtcfaaqfiukdxtkwy`)
- Project health: `ACTIVE_HEALTHY`
- Public database tables: all current public tables have RLS enabled.
- Publishable API key: active.
- Live migration applied: `restrict_competency_evidence_skill_mapping`.
- Competency evidence RPC remains intentionally callable by authenticated learners because the server route invokes it with the learner bearer token.
- The RPC now restricts evidence source → skill mappings:
  - `work_lab` → `independent_sap_mm_work`
  - `incident_lab` → `incident_investigation`
  - `job_readiness` → `sap_mm_job_readiness` or `independent_sap_mm_work`
- Verification completed: an arbitrary skill key is rejected before write.

## Supabase advisor status

### Security

- `SECURITY DEFINER` executable warning remains for `record_competency_evidence_from_source(...)`.
  - Accepted for launch only because the RPC is required by the current authenticated flow and now validates user ownership, source type and allowed skill mapping.
  - Follow-up architecture: move privileged mutation behind a non-exposed private function/service boundary.
- Leaked password protection is disabled.
  - Must be enabled in Supabase Auth before public launch if the plan supports it.

### Performance

- Current findings are informational only (unused indexes and Auth connection allocation strategy).
- Do not remove unused indexes before real production traffic establishes representative usage.

## Application/deployment baseline

- Cloudflare/OpenNext worker config exists (`wrangler.jsonc`, worker name `erp`).
- Worker observability is enabled.
- Repository CI validates dependencies, TypeScript, Next.js build, Cloudflare bundle, and the complete browser journey.
- GitHub currently contains CI only; no repository-managed production deployment workflow is present.

## Required launch acceptance gates

The following must be completed against the real production URL before launch:

1. Confirm the production Cloudflare worker/domain is deployed from the intended `main` commit.
2. Confirm production environment variables point to `nfgmtcfaaqfiukdxtkwy` and use the active publishable key.
3. Create a brand-new learner through the public signup flow.
4. Confirm email/auth behavior and first login on the real domain.
5. Complete the clean learner journey: Foundations → SAP MM → Work Lab → Incident Lab → Competency → Manager Review → Final Certification.
6. Confirm logout/login and token refresh after session expiry/refresh conditions.
7. Confirm public credential/profile verification exposes only intended public data.
8. Confirm mobile navigation and certification flows on a real mobile browser.
9. Confirm Cloudflare runtime logs/observability record API failures without leaking sensitive backend details.
10. Record final production commit SHA and live URL in this document.

## Go / no-go rule

ERP Edu can be marked **GO** only when all launch acceptance gates above pass on the live production deployment with no P0/P1 defects.
