# Supabase deployment checklist

This is a controlled-preparation checklist, not permission to apply a
migration. Record only identifiers, timestamps, checksums, and owners; never
record connection strings, keys, tokens, row data, or customer information.

## 1. Project and connection decisions

- [ ] Create or select the intended Supabase project and record project owner,
  region, plan, and support contact.
- [ ] In **Project Settings → Database**, use SSL for every deployed
  connection. The API validation requires `DATABASE_SSL=true`; its `pg` pool
  uses certificate verification and never disables it.
- [ ] The repository’s initial connection profile is **Supavisor shared session
  pooler on port 5432 for the persistent Render API**, with the bounded local
  `pg` pool retained. Use a short-lived TLS-verified **direct** connection only
  for the controlled migration/backup process if network reachability is
  confirmed. Do not use transaction-pooler port 6543 for this long-running API:
  Supabase documents that mode for transient/serverless clients and it has
  prepared-statement restrictions. Confirm the actual dashboard connection
  string and certificate/CA behavior before entering `DATABASE_URL`; the
  repository does not guess a project hostname or certificate. See
  [Supabase’s connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).
- [ ] Do not enable `rejectUnauthorized: false`, `sslmode=disable`, or a
  per-request database client. The deployed pool is capped by
  `DATABASE_POOL_MAX` (1–30), uses connection/idle/statement timeouts, and is
  drained during shutdown.
- [ ] In **Project Settings → Database**, enable SSL enforcement if supported
  by the selected plan and confirm the project’s certificate/CA instructions.
  See [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).
- [ ] Apply IP/network restrictions where the selected plan supports them. If
  Render egress addresses cannot be fixed, document that limitation and add a
  compensating review of database credentials, TLS, and least privilege.
- [ ] Enable backups/PITR appropriate to the plan, record retention and restore
  owner, and perform a staging restore rehearsal before production promotion.

## 2. Controlled migration plan

Migration order is exact and checksum-protected by `schema_migrations`:

| Order | File | Dependency / purpose |
| --- | --- | --- |
| 001 | `001_create_firms_and_users.sql` | `user_role`, firms, users; requires UUID generator support. |
| 002 | `002_create_registry_trademarks.sql` | Registry projection. |
| 003 | `003_create_firm_invitations.sql` | Firm/user invite references. |
| 004 | `004_add_supabase_user_identity.sql` | Supabase `sub` link. |
| 005 | `005_allow_supabase_only_users.sql` | Password compatibility relaxation. |
| 006 | `006_create_portfolio_marks.sql` | Firm-owned portfolio records. |
| 007 | `007_create_watches.sql` | Portfolio composite foreign key, watch indexes. |
| 008 | `008_create_risk_scores_and_alerts.sql` | Watch/portfolio/risk composite foreign keys. |
| 009 | `009_create_audit_logs.sql` | Append-only audit trigger and indexes. |
| 010 | `010_create_office_action_refs.sql` | Firm/portfolio composite foreign key. |
| 011 | `011_create_search_results.sql` | Immutable firm-scoped snapshots and trigger. |
| 012 | `012_create_exports.sql` | Export lifecycle checks and indexes. |
| 013 | `013_enable_public_schema_rls.sql` | Concrete initial-deployment correction: RLS and deny-by-default grants. |

Do not edit 001–012. Migration 013 is additive and exists because the prior
public business tables had no RLS posture. It enables RLS on every current
`public` table, including the migration ledger, and revokes `anon`,
`authenticated`, and `PUBLIC` table/sequence privileges. The Render database
role must be a server-side role with the required application privileges; do
not add browser policies simply to make frontend queries work.

### One-off runbook

1. Stop any migration automation and confirm the candidate commit/checksums.
2. Confirm a backup/PITR point, test restore authorization, and change window.
3. Run the static check locally: `pnpm --dir backend migration:check`.
4. Use a short-lived, TLS-verified **direct** database connection if the
   project/network supports it. Do not use application startup to migrate.
5. Run `pnpm --dir backend migrate` exactly once from the approved controlled
   operator environment. It takes a PostgreSQL advisory lock and validates only
   its database configuration; it does not need Redis or Auth credentials.
6. Capture command exit status, migration names/checksums, and the safe schema
   queries below. Do not re-run a failed partial migration blindly.

If a migration fails, stop the rollout, preserve its error and migration name
without parameters, and restore/reconcile via an approved database operator.
Do not destructive-down-migrate shared production data. Application rollback is
a previous Render release with optional flags still false; database rollback is
a tested restore/recovery decision.

### Safe preflight and verification queries

These queries return metadata/counts only; they never select business rows.

```sql
-- UUID generator prerequisite. PostgreSQL 16 may provide gen_random_uuid()
-- without an installed pgcrypto extension, so the function result is decisive.
SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';
SELECT to_regprocedure('gen_random_uuid()') IS NOT NULL AS uuid_function_available;

-- Migration ledger and ordered application state.
SELECT name, checksum, applied_at FROM schema_migrations ORDER BY name;

-- Current public tables and RLS state.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- Data API/browser roles must have no business-table privileges.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

-- Trigger protections and composite firm-scoped foreign keys.
SELECT event_object_table AS table_name, trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN ('audit_logs_reject_mutation', 'search_results_reject_mutation')
ORDER BY table_name;
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f' AND pg_get_constraintdef(oid) LIKE '%(firm_id,%'
ORDER BY table_name::text, conname;

-- Authorization/lifecycle index presence and export constraint names.
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'users_firm_id_idx', 'portfolio_marks_firm_id_idx',
    'watches_firm_id_idx', 'audit_logs_firm_occurred_id_idx',
    'search_results_firm_created_id_idx', 'exports_firm_status_created_id_idx',
    'exports_firm_requester_created_id_idx', 'exports_firm_source_entity_idx'
  )
ORDER BY tablename, indexname;
SELECT conname
FROM pg_constraint
WHERE conrelid = 'exports'::regclass
  AND conname LIKE 'exports_%_state_consistent'
ORDER BY conname;
```

Before migration, confirm `gen_random_uuid()` availability with the first
query. `pgcrypto` may be installed but is not itself the decisive prerequisite
on PostgreSQL 16. If the function is missing, use an approved Supabase database
change before 001; do not rewrite historical migration files. Verify role
changes with the application’s transactional `FOR UPDATE` last-Admin guard in
staging; it is a service-level concurrency protection, not a reason to weaken
RLS. Verify the audit/search append-only triggers and export lifecycle checks
with the metadata queries above.

## 3. RLS, grants, and Storage

- [ ] Inventory all `public` tables with the RLS query above. Current list:
  `firms`, `users`, `registry_trademarks`, `firm_invitations`,
  `portfolio_marks`, `watches`, `risk_scores`, `alerts`, `audit_logs`,
  `office_action_refs`, `search_results`, `exports`, and `schema_migrations`.
- [ ] Confirm every table reachable through the Supabase Data API has RLS
  enabled. This product’s business data is backend-only, so the intended
  `anon`/`authenticated` policy set is empty and grants are revoked.
- [ ] Confirm the frontend makes no protected table requests; its Supabase use
  is Auth only. The service-role key stays only in Render.
- [ ] If Supabase Storage is later introduced, list each bucket, set it private,
  revoke public access, define firm-scoped server-side authorization, and test
  object metadata/checksum rules. Do not create a public bucket for exports.

## 4. Auth dashboard actions

In **Authentication → URL Configuration**, set the canonical production Site
URL and add these exact redirect URLs. Replace angle-bracket values with actual
approved origins; do not use a wildcard:

| Environment | Exact redirect URLs |
| --- | --- |
| Local | `http://localhost:5173/auth/callback`, `http://localhost:5173/auth/verify-email`, `http://localhost:5173/auth/reset-password` |
| Approved Vercel preview | `https://<approved-preview-deployment>.vercel.app/auth/callback`, `https://<approved-preview-deployment>.vercel.app/auth/verify-email`, `https://<approved-preview-deployment>.vercel.app/auth/reset-password` |
| Production | `https://<production-domain>/auth/callback`, `https://<production-domain>/auth/verify-email`, `https://<production-domain>/auth/reset-password` |

- [ ] Enable only intended email/OAuth providers, configure sender/domain and
  confirmation/recovery email templates, and review Supabase Auth rate limits.
- [ ] Configure Google/OAuth provider redirect settings using Supabase’s own
  callback URI where applicable; never place access tokens in application URLs.
- [ ] Confirm the frontend callback removes code/fragment/query data after
  exchange and only accepts its known callback routes. See [Supabase redirect
  URL guidance](https://supabase.com/docs/guides/auth/redirect-urls), while
  retaining this project’s stricter no-wildcard policy.
- [ ] Record key ownership, key rotation cadence, break-glass owner, and a
  tested sequence to rotate the publishable and server-only key without
  exposing either in logs.
