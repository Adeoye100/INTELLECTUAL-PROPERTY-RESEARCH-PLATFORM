# Supabase Database Migration Handoff

Updated: 2026-10-29

## Objective

Move the application from the restricted, full old Supabase project to a new free Supabase project before deleting the old project. Preserve the active USPTO trademark corpus and public application data while avoiding another storage incident.

## Important security state

- Database passwords were previously pasted into chat and must be rotated. Never place connection strings or passwords in this file, Git, or chat.
- Use hidden terminal prompts for `IPRP_OLD_DB_URL` and `IPRP_NEW_DB_URL`.
- The new connection URL must be copied from Supabase or have special password characters URL-encoded. A raw `#` caused Node to parse the password as a URL fragment.

## Why the old project was restricted

- The old project reached disk/quota pressure while the USPTO table contained inactive rows and large indexes.
- PostgreSQL entered read-only mode. `SELECT 1` worked, but `DELETE`, `DROP INDEX`, and `VACUUM FULL` were rejected.
- Repeated deletes eventually produced `pg_wal ... No space left on device`.
- Do not run further writes against the old project. It is now a read-only source/export database.

## Verified old-project state

- Active USPTO rows exported: `167,105`.
- Active status counts: `166,780` `registered`, `325` `pending`.
- Inactive rows were not exported.
- Old project retained data-through date: `2026-04-02`.
- Active export file:
  `/tmp/iprp-migration.pB2UTY/registry_trademarks_active.csv`
- Export verification: `COPY 167105`; CSV line count `167106` including the header.

## New project state

- New Supabase project has been created.
- Repository migrations completed successfully: `Database migrations are up to date.`
- The public application data dump was created with PostgreSQL 17 because the old server is PostgreSQL `17.6` and the host client was PostgreSQL `16.15`.
- Successful public-data import completed. It included application tables and excluded:
  - `public.registry_trademarks` (migrated separately with active rows only)
  - `public.schema_migrations`
  - `public.firm_invitations` and `public.organization_provisioning_intents` (transient invitation/provisioning data)
- Active trademarks were imported successfully into the new project:
  `COPY 167105`.
- New-project active status verification:
  - `pending`: `325`
  - `registered`: `166780`
- The manual baseline `INSERT` was executed successfully in the new SQL Editor. The editor displayed `Success. No rows returned`, which is normal for an `INSERT` without `RETURNING`.
- Baseline verification succeeded in the new project: `status=complete`, `coverage_kind=baseline`, `retained_record_count=167105`, `data_through_date=2026-04-03`, completed `2026-10-29`.
- New-project storage verification succeeded: trademark relation `118 MB`, refresh-run relation `80 kB`, total database `132 MB`.
- New-project status verification succeeded: `325` pending and `166780` registered; no inactive USPTO statuses were imported.

## Current terminal issue

If the terminal displays only:

```text
>
>
```

the shell is waiting for the closing heredoc marker from a command containing `<<'SQL'`. Type `SQL` on a line by itself and press Enter, or press `Ctrl+C` to cancel. The closing marker must have no spaces before or after it.

Do not paste a shell command beginning with `psql` into Supabase SQL Editor. Supabase SQL Editor accepts SQL only. The `psql ... <<'SQL'` wrapper is for a terminal.

## Immediate next step

Run the following SQL-only block in the **new Supabase SQL Editor**. It creates a fresh completed USPTO baseline for the filtered corpus:

```sql
WITH corpus AS (
  SELECT
    COUNT(*)::integer AS record_count,
    MAX(source_updated_at) AS data_through_date
  FROM public.registry_trademarks
  WHERE source_registry = 'USPTO'
)
INSERT INTO public.registry_refresh_runs (
  source_registry,
  status,
  coverage_kind,
  source_release,
  expected_file_count,
  latest_discovered_source_date,
  data_through_date,
  discovered_file_count,
  processed_record_count,
  retained_record_count,
  changed_record_count,
  projected_record_count,
  projection_backlog_count,
  started_at,
  ingestion_completed_at,
  projection_completed_at,
  completed_at
)
SELECT
  'USPTO',
  'complete',
  'baseline',
  'manual-migration',
  1,
  data_through_date,
  data_through_date,
  1,
  record_count,
  record_count,
  record_count,
  record_count,
  0,
  now(),
  now(),
  now(),
  now()
FROM corpus;
```

Expected SQL Editor result: one successful insert. Do not include `psql`, shell variables, backslashes, or the heredoc markers.

For a terminal, the equivalent wrapper is:

```bash
psql "$IPRP_NEW_DB_URL" \
  -X \
  -P pager=off \
  --set=ON_ERROR_STOP=1 <<'SQL'
WITH corpus AS (
  SELECT
    COUNT(*)::integer AS record_count,
    MAX(source_updated_at) AS data_through_date
  FROM public.registry_trademarks
  WHERE source_registry = 'USPTO'
)
INSERT INTO public.registry_refresh_runs (
  source_registry,
  status,
  coverage_kind,
  source_release,
  expected_file_count,
  latest_discovered_source_date,
  data_through_date,
  discovered_file_count,
  processed_record_count,
  retained_record_count,
  changed_record_count,
  projected_record_count,
  projection_backlog_count,
  started_at,
  ingestion_completed_at,
  projection_completed_at,
  completed_at
)
SELECT
  'USPTO',
  'complete',
  'baseline',
  'manual-migration',
  1,
  data_through_date,
  data_through_date,
  1,
  record_count,
  record_count,
  record_count,
  record_count,
  0,
  now(),
  now(),
  now(),
  now()
FROM corpus;
SQL
```

Expected output:

```text
INSERT 0 1
```

## Verify the baseline

```bash
psql "$IPRP_NEW_DB_URL" -X -P pager=off -c \
"SELECT source_registry, status, coverage_kind, retained_record_count, data_through_date, completed_at FROM public.registry_refresh_runs WHERE source_registry = 'USPTO' ORDER BY completed_at DESC LIMIT 1;"
```

Expected latest row:

- `source_registry`: `USPTO`
- `status`: `complete`
- `coverage_kind`: `baseline`
- `retained_record_count`: `167105`
- `data_through_date`: `2026-04-03` (verified new-project value)

## Remaining verification sequence

1. Run `ANALYZE public.registry_trademarks` on the new project.
2. Check new-project relation size and keep a substantial margin below 500 MB.
3. Verify counts and that no non-active USPTO statuses exist.
4. Point a local API instance to the new database with `SEARCH_BACKEND=postgres`.
5. Create a test user in the new Supabase Auth project. Old Auth users are not automatically available in the new project.
6. Map the new Auth user UUID to the matching migrated `public.users.supabase_user_id` row.
7. Verify `/healthz`, `/readyz`, authenticated search, firm isolation, and the refresh worker.
   - Completed locally on 2026-10-29: API started with the updated `.env`, `SEARCH_BACKEND=postgres`, and the new database settings; `/healthz` returned HTTP 200 `{"status":"ok"}` and `/readyz` returned HTTP 200 `{"status":"ready"}`.
8. Only after successful verification update Render/Vercel environment variables.
9. Keep the old project intact until the new deployment has been tested and a final export is retained.
10. Do not manually overwrite the new project's `auth.*` schema. Existing users will need new accounts/password resets or a separately planned Auth migration.

## Search architecture after migration

The immediate cutover should use PostgreSQL search in the new Supabase project:

```text
SEARCH_ENABLED=true
SEARCH_BACKEND=postgres
SEARCH_SOURCE_REGISTRIES=USPTO
```

Elasticsearch is not required for this recovery. It can be introduced later after a production cluster is populated and verified.

## Production cutover status — 2026-10-29

- Local API started with the new backend `.env`; `/healthz` and `/readyz` both returned HTTP 200.
- Frontend production build completed successfully with the new CSP reference; frontend source/build secret scans passed.
- `frontend/vercel.json` and its regression test now reference the new Supabase project rather than the retired project.
- The new Supabase Auth endpoint still returns HTTP 402 with `exceed_db_size_quota` from the Supabase gateway. PostgreSQL is reachable and reports approximately 132 MB, but Auth remains externally restricted.
- Do not deploy the production frontend cutover or delete the old project until the new Auth endpoint returns normally, a new Auth user can sign in, and an authenticated `/api/v1/search` smoke test succeeds.

## Recovery path if the new project's Auth remains restricted

The migration preserved `public.users` and the reduced USPTO corpus, but no Supabase Auth identities: the verification query returned `local_users = 75`, `matching_auth_users = 0`, and `missing_auth_users = 75`. The application UUIDs are not password-bearing Auth accounts.

If the current new project continues returning `exceed_db_size_quota`, create a fresh Supabase project and verify its Auth service while it is still empty. Do not import data until a test Auth user can be created and signed in. Then migrate the schema, public application data, and the 167105 retained USPTO records; recreate the real business users; map `public.users.supabase_user_id` to the new `auth.users.id`; complete authenticated search and production smoke tests; and only then retire the old/restricted projects.
