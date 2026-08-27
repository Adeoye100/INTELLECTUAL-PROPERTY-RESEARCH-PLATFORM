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
renewal period. BE-14 billing remains explicitly deferred.

Current gates: provider decision, migration application, staging smoke/auth/RBAC
checks, private storage/Redis/network validation, P95 measurements, dependency
advisories, independent audit, and live Multi-AZ failover verification.
