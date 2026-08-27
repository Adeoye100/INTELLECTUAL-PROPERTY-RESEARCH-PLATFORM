# Initial deployment runbook

This is an operator-run procedure. It does not authorize automatic deployment,
migration, use of customer data, or production security testing. Stop at any
failed gate, preserve redacted evidence, and use the listed rollback action.

| Step | Prerequisites | Command or dashboard location | Expected safe result | Failure / rollback action | Evidence to record |
| --- | --- | --- | --- | --- | --- |
| 1. Review candidate | Clean review, approved change owner | Review diff; run local checks in this repository; commit only after approval | Candidate commit contains deployment preparation only | Do not deploy; fix/revert uncommitted preparation changes | Commit ID, reviewer, check results |
| 2. Configure Supabase project | Approved account, region, owner | Supabase dashboard: create/select project | Empty intended project/account, no application traffic | Stop if project/owner/region is wrong | Project reference, owner, plan/region |
| 3. Configure database/Auth protections | Project selected | Supabase Settings/Auth: SSL, network controls, backups/PITR, RLS/policy review, exact redirects, email providers | TLS/backup/auth configuration recorded; no public business access | Revert dashboard change if it broadened access; do not weaken RLS | Screenshots/redacted change log, backup policy, redirect list |
| 4. Confirm backup | Backup/PITR configured | Supabase backup/PITR dashboard | Recovery point and restore owner confirmed before schema work | Do not migrate | Backup timestamp, retention, restore contact |
| 5. Apply migrations once | Steps 1–4; controlled operator; TLS direct connection selected | `pnpm --dir backend migration:check`, then approved one-off `pnpm --dir backend migrate` | 001–013 complete under advisory lock; no web startup migration | Stop; preserve migration name/error; use approved restore/reconciliation, never destructive down-migration | Exit code, checksum ledger, operator/time |
| 6. Verify schema | Step 5 completed | Run metadata queries in [16](16-supabase-deployment-checklist.md) | UUID/extension, table/RLS/grants, triggers, FK/index/export metadata match expectations | Do not deploy API; reconcile with DB owner | Query result metadata, no row data |
| 7. Configure Render values | Steps 2–6; approved secrets owner | Render API → Environment / environment group | Names are present, values are server-only, `TRUST_PROXY_HOPS=1`, exact CORS, all optional flags false | Delete incorrect secret/version; do not copy it to Vercel/Git | Environment names, owner, change timestamp |
| 8. Deploy Render API | Render config valid; Redis and Supabase available | Render Blueprint/API deploy for the reviewed commit | API starts with no migration and optional integrations disabled | Roll back to prior Render release or stop service; leave DB unchanged | Render release ID, commit, build/start log summary |
| 9. Verify process/dependency endpoints | Step 8 complete | HTTPS `GET /healthz`, then safe `GET /readyz` from approved operator context | `/healthz` alive; `/readyz` reports only safe dependency categories | Inspect redacted API/Redis/DB logs; do not make `/readyz` the restart health path | Status codes, timestamps, redacted bodies |
| 10. Authenticated API smoke | Dedicated non-sensitive test accounts | Approved authenticated requests to `/me`, allowed basic API path, role/firm negative checks | Correct auth/RBAC/firm concealment; no tokens logged | Stop promotion; investigate with redacted request IDs | Account aliases, result codes, request IDs |
| 11. Deploy Vercel preview | Render preview/staging API exact origin known | Vercel dashboard: preview build with preview-only safe public values | Build validates and bundle scan passes; no backend secret value is configured | Fix public config/build; do not fall back to mock/demo | Preview deployment URL, build ID, bundle check |
| 12. Allow exact preview origin | Step 11 URL chosen | Render `CORS_ALLOWED_ORIGINS`; Supabase Auth URL Configuration | Three exact preview callback URLs and exact CORS origin, no wildcard | Remove incorrect origin; redeploy API only if env requires it | Origin list, owner, time |
| 13. Test preview auth and roles | Steps 10–12 | Browser smoke with dedicated accounts | Login, recovery, callback, Dashboard, loading/error states, Admin/Attorney/Viewer boundaries work | Stop; correct configuration/code before production promotion | Browser/version, results, CSP/console summary |
| 14. Promote Vercel production | Preview evidence accepted | Vercel promote reviewed deployment | Production uses production-only safe public values | Re-promote prior Vercel deployment | Production deployment ID, commit, approver |
| 15. Allow exact production origin | Production domain fixed | Render CORS and Supabase Auth URL Configuration | Exact production CORS origin and three redirects; canonical Site URL set | Remove stale/wrong origin; do not broaden to wildcard | Origin/redirect change record |
| 16. Production flow verification | Steps 14–15; change window | Non-destructive checklist in [20](20-post-deployment-smoke-checklist.md) | Core enabled profile works with non-sensitive test data | Stop release / rollback Vercel or Render release as appropriate | Checklist, release IDs, incident references |
| 17. Provision optional infrastructure separately | Initial core stable | Separate approved project changes for Redis queue capacity, Elasticsearch, private storage | No feature flag changes yet; owners and monitoring defined | Delete/revert only newly created optional resources under owner process | Resource IDs, access review, monitoring owner |
| 18. Enable/deploy workers only after staging | Step 17 and individual staging gates | Create separate Render workers with `pnpm watch:worker` / `pnpm pdf-export:worker`; set only then-approved flags | Worker heartbeat/queue/storage checks pass; API stays separate | Turn flag off and stop worker; do not use filesystem PDF storage in production | Worker release IDs, queue/heartbeat/storage results |
| 19. Rollback rehearsal | Backup and prior release IDs available | Staging: redeploy previous API/Vercel release; test recovery plan | Services recover without destructive schema rollback; optional flags stay off | Escalate if restore/release is unavailable | RTO observation, owners, gaps |
| 20. Record ownership | All prior steps complete | Release/change record | Commit IDs, dashboard configuration owners, alert/backup owners, outstanding gates are current | Keep status as pending; do not claim production verification | Final deployment record |

## Initial configuration values (names only)

For the first API release, set `SEARCH_ENABLED=false`,
`OFFICE_ACTION_SEARCH_ENABLED=false`, `WATCH_ENABLED=false`, and
`PDF_EXPORT_ENABLED=false`. Do not provide optional integration credentials as a
substitute for completing their prerequisite gates. Core production validation
requires `DATABASE_SSL=true`, a non-placeholder TLS PostgreSQL URL, a `rediss:`
URL, exact HTTPS CORS origin(s), and one trusted Render proxy hop.

## Rollback principles

1. Stop the rollout and preserve redacted logs/request IDs.
2. Re-deploy the previous known-good Render and/or Vercel release; do not
   perform a destructive migration rollback.
3. Keep optional features disabled and stop their workers before restoring any
   queue/storage state.
4. If a database recovery is necessary, use the pre-migration backup/PITR
   procedure with the Supabase owner; then run safe schema metadata checks.
5. Record the decision, impact, release IDs, recovery evidence, and a follow-up
   owner before another deployment attempt.
