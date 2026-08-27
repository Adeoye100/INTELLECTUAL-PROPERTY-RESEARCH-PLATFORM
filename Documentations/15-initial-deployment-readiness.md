# Initial deployment readiness

## Scope and evidence boundary

This document prepares the repository for an initial Supabase / Render / Vercel
deployment. It is not evidence of a deployed service. No migration, dashboard
change, cloud resource, deployment, or public-system security test was run
while preparing it.

The initial profile exposes only the authenticated core API and its Dashboard.
The API still requires PostgreSQL, Redis (membership cache and rate limiting),
and Supabase Auth before it can start. Redis is **not** replaced with in-memory
state. All optional integration flags default to `false` and do not construct
their network clients while disabled.

| Item | Status | Repository preparation | External gate / evidence still required |
| --- | --- | --- | --- |
| Supabase | Code-ready, configuration pending | TLS pool, JWT verification, server-only admin key boundary, RLS corrective migration, and runbook are present. | Create/select project; configure SSL, backups, Auth, keys, and access controls. |
| Render API | Code-ready, configuration pending | `render.yaml`, Node 22.14 target, `/healthz`, `/readyz`, graceful shutdown, secure config validation, CORS and headers are present. | Supply secrets, select verified Supabase session-pooler/direct connection, configure exact origins, deploy. |
| Render watch worker | Disabled for initial deployment | Separate `pnpm watch:worker` command exists; API no longer mounts watch/alert routes when disabled. | Redis, search, migrations, monitoring, staging worker proof, then separate worker service. |
| Render PDF-export worker | Disabled for initial deployment | Separate `pnpm pdf-export:worker` command and integrity checks exist. | Redis, migrations, malware/storage design, shared private storage adapter, monitoring, staging proof. |
| Redis | Code-ready, configuration pending | Production validation requires `rediss:` and bounded use; no in-memory fallback. | Provision TLS Redis and least-privilege credential; validate API readiness. |
| Elasticsearch | Disabled for initial deployment | `SEARCH_ENABLED=false` avoids construction and routes return normal 404. | Provision authenticated HTTPS cluster, implement credential handling, reproject source documents, staging verification. |
| Private export storage | Disabled for initial deployment | Filesystem adapter is create-only and checks PDF signature, size, checksum, and server-generated keys. | Implement/verify a shared private object-storage adapter; filesystem storage is deliberately rejected in production. |
| Vercel frontend | Code-ready, configuration pending | Root `vercel.ts`, production config validation, explicit API origin, headers/CSP, source-map disablement, and bundle secret scan are present. | Set safe public values separately for preview and production; deploy preview. |
| Supabase Auth redirect URLs | Code-ready, configuration pending | Callback code uses an allowlist and removes callback query/fragment data. | Add exact local, approved-preview, and production URLs; no wildcard allowlist. |
| Database migrations | Code-ready, configuration pending | Ordered inventory is 001–013; no historical migration changed; 013 enables deny-by-default RLS. | Backup, controlled one-off application, schema/RLS query evidence. |
| Security checks | Ready | Local static checks, config tests, sink scans, feature gates, headers, and secret/bundle checks are included. | Advisory access, container build, staging/browser evidence, and independent review remain separate gates. |
| Smoke tests | Code-ready, configuration pending | A non-destructive checklist and staged order are documented. | Dedicated non-sensitive accounts and deployed staging endpoints. |
| Rollback readiness | Code-ready, configuration pending | Rollback procedure preserves migration history and keeps feature flags off. | Restore test, prior Render/Vercel release identifiers, named owners, backup evidence. |

Only the status terms in the table are readiness classifications. Nothing is
labelled **Verified in staging** or **Verified in production** because no such
evidence exists.

## Initial feature profile

| Area | Initial posture | User-visible behavior |
| --- | --- | --- |
| Core API and Dashboard | Enabled after core configuration | Authenticated users reach `/dashboard`; authorization remains server-side. |
| Supabase Auth / PostgreSQL | Enabled after configuration and migration verification | Browser uses only the publishable/anon key; API verifies the Bearer token then resolves firm and role from server-side state. |
| Portfolio workflow | Disabled for initial deployment | The current frontend uses a different portfolio contract from the API. `/portfolio` explicitly reports unavailable rather than issuing broken requests. |
| Federated search and risk detail | Disabled | Search routes are unmounted and return the existing JSON 404; frontend explains that provisioning/reprojection is pending. |
| Office Action search | Disabled | Provider route is unmounted; no licensed source is configured. Existing manual reference APIs remain server-only API functionality, not frontend navigation. |
| Watches and alerts | Disabled | Watch/alert routes are unmounted, workers are not deployed, and the frontend reports unavailable. |
| PDF exports | Disabled | Export routes are unmounted. No queue, storage, or worker is constructed. |
| Billing / BE-14 | Disabled / not implemented | Administration/billing navigation is unavailable; demonstration billing data is not shipped as an enabled workflow. |
| Diagnostics and detailed errors | Disabled | Legacy ping routes are absent by default; safe error codes/messages exclude `details`, stack traces, SQL, and configuration. |

Disabled routes deliberately produce the application’s normal `404` response,
not a substitute in-memory integration. Disabled frontend pages are explicit
terminal states with a dashboard link, so they neither spin indefinitely nor
show protected/mock data.

## Repository preparation versus deployment work

| Category | Completed in repository | Must be done outside the repository |
| --- | --- | --- |
| Repository preparation | Code/config guards, RLS migration, templates, Blueprint, Vercel config, tests, and these checklists. | Review and commit the candidate only after local checks pass. |
| Dashboard configuration | None. | Supabase SSL/Auth/backups/redirects/RLS checks, Render secrets and CORS, Vercel public values/preview separation. |
| Migration application | None. | Controlled one-off application through migration 013 using a backup and the verification queries in [16](16-supabase-deployment-checklist.md). |
| External infrastructure | None. | Supabase, Render API, Redis; later Elasticsearch and private storage. |
| Deployment execution | None. | Deploy API first with optional flags off, then a Vercel preview, then promotion. |
| Post-deployment verification | None. | Run the non-destructive checklist in [20](20-post-deployment-smoke-checklist.md) using dedicated test accounts. |

## Environment-variable contract

`backend/.env.example` and `frontend/.env.example` intentionally contain only
names and safe placeholders. There is no root `.env.example`: the root has no
environment loader; Render and Vercel receive their own scoped values.

| Scope / class | Variables | Rules |
| --- | --- | --- |
| Frontend-public, build/runtime | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`, optional development-only `VITE_API_MODE` and `VITE_MOCK_ADAPTER_DELAY` | Public project URL, publishable/anon key, and explicit HTTPS API URL only. The production resolver rejects placeholders, localhost, root-relative API URLs, service-role-shaped keys, and mock mode. |
| Backend-secret, runtime | `DATABASE_URL`, `REDIS_URL`, `SUPABASE_SECRET_KEY`, `JWT_ACCESS_SECRET`, `AUTH_RATE_LIMIT_KEY_SECRET`, optional `USPTO_TSDR_API_KEY` | Render-only. Never use a `VITE_*` name, browser bundle, source map, `render.yaml` value, log message, or documentation value. |
| Backend runtime configuration | `NODE_ENV`, `PORT`, `DATABASE_SSL`, pool/timeout variables, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, Supabase verification variables, invitation/worker and rate-limit bounds | Startup validates protocol, integer bounds, production TLS, exact origins, proxy hops, and placeholder values without echoing secrets. Render supplies `PORT`. |
| Optional feature-gated runtime | `SEARCH_*`, `ELASTICSEARCH_URL`, `ELASTICSEARCH_INDEX`, `OFFICE_ACTION_*`, `WATCH_*`, `PDF_EXPORT_*` | Not required while their feature flag is false. `WATCH_ENABLED` requires search; production PDF exports are rejected until shared private storage exists. |
| One-off operational/test secrets | `TEST_DATABASE_URL`, `TEST_REDIS_URL`, `TEST_ELASTICSEARCH_URL`, `SUPABASE_TEST_ACCESS_TOKEN`, `STAGING_*`, `LOAD_TEST_*`, `ALLOW_*` | Never deploy as application variables. Tests require explicit non-production opt-in and are not run by this preparation. |
| Generated by hosting | `PORT` (Render), `NODE_VERSION` (Blueprint setting) | Do not hard-code a production listening port. |

The bundle check fails if known backend-secret variable names occur in frontend
source or `frontend/dist`, and also fails a production build that contains
localhost or placeholder endpoint markers.

## Review findings retained as gates

- The API is deliberately Redis-dependent even while queues are disabled:
  Redis backs rate limiting and role/firm cache. A secure Redis service is a
  core API prerequisite, not an optional queue fallback.
- The frontend/API contract mismatch for portfolio, exports, attachments, and
  administrative billing is a real initial-deployment blocker for those
  workflows. They are unavailable rather than papered over with mock data.
- Elasticsearch has no credential configuration in the current runtime;
  enabling a secured cluster requires a separately reviewed implementation and
  full re-projection.
- PDF filesystem storage cannot be shared safely across separate Render API and
  worker services. Enabling it in production is refused until an approved
  private storage adapter is built and verified.
- The local backend `.env` was not edited. A configuration-only parse reached
  the production proxy-hop and TLS gates; no credential, database, Redis,
  Supabase, or live test was attempted.

See the companion checklists for evidence collection and exact external work.
