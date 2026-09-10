# Deployment and operations runbook

> Historical multi-cloud operations material. The selected initial topology is
> Supabase, Render, and Vercel; use [15](15-initial-deployment-readiness.md)
> through [20](20-post-deployment-smoke-checklist.md) for its controlled launch
> sequence. This document remains relevant only for later multi-AZ/IaC work.

## Preconditions

AWS versus Google Cloud remains unselected (ADR-001); no deployment may begin
until provider, region, state/lock service, secret manager, registry, budget,
and staging/production accounts are approved. Use secret references only. Never
put secret values in Compose, image layers, logs, manifests, or this runbook.

Required configuration includes database/Redis/Supabase URLs and secret
references, `SUPABASE_JWT_VERIFICATION_MODE`, algorithm allowlist, rate-limit
key, explicit proxy hops, feature flags, search/registry limits, PDF private
storage root/provider, and worker heartbeat TTL. Production uses HTTPS and an
explicit trusted CORS origin/edge policy; development defaults must not become
production values.

## Release procedure

1. Run `pnpm --dir backend check`, `test:unit`, `migration:check`,
   `security:secrets`, and `openapi:check` on the candidate.
2. Build separate API, watch-worker, and PDF-worker image targets. Do not run
   migrations in replica startup; the Docker image is non-root and compatible
   with a read-only root plus writable `/tmp` and private export mount.
3. Back up and verify restore access before any migration. Review ordered
   migrations 001–012, apply once through the controlled migration job in
   disposable staging, capture checksum evidence, and never rewrite history.
4. Deploy API replicas behind the private/public edge as selected by IaC. Use
   `/healthz` for liveness and `/readyz` for dependency readiness; drain for up
   to 25 seconds on SIGTERM. Deploy watch and PDF workers separately.
5. Verify Redis, search, private storage, worker heartbeat keys, audit writes,
   and the non-destructive staging smoke runner. Run BE-23 smoke before any
   staged load profile. Production requires manual approval after staging gates.

## Health, scaling, recovery

Production topology requires two API replicas across two AZs, private managed
PostgreSQL/Redis/search/object storage, worker restarts, rolling minimum healthy
capacity, bounded autoscaling, encrypted backups, and alerts for API health,
queue depth/age, heartbeat loss, DB saturation, Redis/search failure, export
failure, and audit-write failure. Staging can be single-AZ/cost-sensitive and
does not demonstrate availability.

Proposed production recovery objectives are **RPO ≤ 24 hours** and **RTO ≤ 4
hours**, pending provider backup/failover confirmation; staging is best effort.
Test backup restore and regional/AZ failover in staging before accepting those
objectives. On incident: stop rollout, preserve safe
logs/audit evidence, assess queue/worker/storage state, restore only through the
approved runbook, and communicate status. Roll back by redeploying the previous
signed image; do not roll back already-applied migrations destructively.

## Ongoing operations

Rotate secret-manager references with overlapping validation where supported;
revoke old values only after successful staging verification. Agree audit
retention/archive and legal hold policy before cleanup. Review capacity, backups,
dependency advisories, registry limits, and independent-audit findings each
renewal period. BE-14 billing remains disabled until the live Paystack
configuration and reconciliation gates in
`22-production-billing-registry-auth-security.md` are completed.

Current gates: provider decision, migration application, staging smoke/auth/RBAC
checks, private storage/Redis/network validation, P95 measurements, dependency
advisories, independent audit, and live Multi-AZ failover verification.

## Release governance & CI enforcement policy (P5-01)

### Branch protection boundary
The `main` branch serves as the authoritative production release boundary for the repository.
- **Direct Pushes**: Prohibited. All changes must be merged via pull requests.
- **Force Pushes**: Disabled (`allow_force_pushes: false`).
- **Branch Deletions**: Disabled (`allow_deletions: false`).
- **Branch Parity**: Require branches to be up-to-date before merging (`strict: true`).

### Required CI status checks
Merges to `main` require 100% passing results across all five required GitHub Actions status checks:
1. `Syntax, unit, and ephemeral-store integration tests` (Backend syntax, migration check, OpenAPI check, unit + ephemeral DB integration tests)
2. `Local secret and advisory gates` (Tracked secret-pattern scan, frontend secret scan, dependency advisory scan: 0 HIGH / 0 CRITICAL)
3. `Build API and worker images` (Docker build verification for API, watch worker, PDF export worker)
4. `Render API & Workers deployment release gate` (Aggregated release readiness check)
5. `Lint, test, and production build` (Frontend ESLint, Vitest suite, Vite production build, bundle secret scan, frontend dependency audit: 0 HIGH / 0 CRITICAL)

### Vercel vs CI deployment boundary
Vercel deployment success is a UI preview artifact only and does NOT constitute release approval. Commits must pass all GitHub Actions CI status checks before merging to `main`.

### Fail-closed feature flag policy
The following capabilities MUST remain `false` (fail-closed) until separate production prerequisites are verified:
- `SEARCH_ENABLED=false` (USPTO bulk index ingestion)
- `OFFICE_ACTION_SEARCH_ENABLED=false` (Office Actions pipeline)
- `WATCH_ENABLED=false` (Trademark watch workers)
- `PDF_EXPORT_ENABLED=false` (PDF export worker)
- `PAYSTACK_LIVE=false` (Live Paystack billing integration)

### Break-glass procedure
In severe production outage scenarios requiring an immediate fix:
1. Incident Commander authorizes break-glass emergency procedure.
2. Temporary administrative override of branch protection is logged in the incident record.
3. Fix is committed and pushed directly or merged via emergency PR.
4. Immediately following incident resolution, branch protection rules are re-enforced, and a post-mortem pull request with full CI suite execution must be recorded.

