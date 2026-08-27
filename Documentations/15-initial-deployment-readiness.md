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
| Render API | Code-ready, configuration pending | `render.yaml`, Node 22.14 target, `/healthz`, `/readyz`, graceful shutdown, bounded PostgreSQL and HTTP connection limits, strict CORS, and headers are present. | Supply secrets, choose the documented Supabase connection path, configure exact origins, deploy. |
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
| Federated search and risk detail | Disabled for initial deployment | Search routes are unmounted and return the existing JSON 404; frontend explains that provisioning/reprojection is pending. |
| Office Action search | Disabled for initial deployment | Provider route is unmounted; no licensed source is configured. Existing manual reference APIs remain server-only API functionality, not frontend navigation. |
| Watches and alerts | Disabled for initial deployment | Watch/alert routes are unmounted, workers are not deployed, and the frontend reports unavailable. |
| PDF exports | Disabled for initial deployment | Export routes are unmounted. No queue, storage, or worker is constructed. |
| Billing / BE-14 | Disabled for initial deployment | Billing is not implemented; administration/billing navigation is unavailable and demonstration billing data is not shipped as an enabled workflow. |
| Diagnostics and detailed errors | Disabled for initial deployment | Legacy ping routes are absent by default; safe error codes/messages exclude `details`, stack traces, SQL, and configuration. |

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
| Frontend-public, build/runtime | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`, optional development-only `VITE_API_MODE` and `VITE_MOCK_ADAPTER_DELAY` | Public project URL, publishable key, and explicit HTTPS API URL only. The production resolver rejects placeholders, localhost, root-relative API URLs, service-role-shaped keys, and mock mode. |
| Backend-secret, runtime | `DATABASE_URL`, `REDIS_URL`, `SUPABASE_SECRET_KEY`, `JWT_ACCESS_SECRET`, `AUTH_RATE_LIMIT_KEY_SECRET`, optional `USPTO_TSDR_API_KEY` | Render-only. Never use a `VITE_*` name, browser bundle, source map, `render.yaml` value, log message, or documentation value. |
| Backend runtime configuration | `NODE_ENV`, `PORT`, `DATABASE_SSL`, PostgreSQL and HTTP timeout/bound variables, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, Supabase verification variables, invitation/worker and rate-limit bounds | Startup validates protocol, integer bounds, production TLS, exact origins, proxy hops, request/header timeouts, and placeholder values without echoing secrets. Render supplies `PORT`. |
| Optional feature-gated runtime | `SEARCH_*`, `ELASTICSEARCH_URL`, `ELASTICSEARCH_INDEX`, `OFFICE_ACTION_*`, `WATCH_*`, `PDF_EXPORT_*` | Not required while their feature flag is false. `WATCH_ENABLED` requires search; production PDF exports are rejected until shared private storage exists. |
| One-off operational/test secrets | `TEST_DATABASE_URL`, `TEST_REDIS_URL`, `TEST_ELASTICSEARCH_URL`, `SUPABASE_TEST_ACCESS_TOKEN`, `STAGING_*`, `LOAD_TEST_*`, `ALLOW_*` | Never deploy as application variables. Tests require explicit non-production opt-in and are not run by this preparation. |
| Generated by hosting | `PORT` (Render), `NODE_VERSION` (Blueprint setting) | Do not hard-code a production listening port. |

The bundle check fails if known backend-secret variable names occur in frontend
source or `frontend/dist`, and also fails a production build that contains
localhost or placeholder endpoint markers.

### Exhaustive variable inventory

The committed [`backend/.env.example`](../backend/.env.example) and
[`frontend/.env.example`](../frontend/.env.example) are the safe value
templates. This is the complete name-only inventory, including deliberately
separate operator/test commands.

| Classification | Variables | Deployment rule |
| --- | --- | --- |
| 1. Frontend-public | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL` | Vercel build values only; all are intentionally browser-visible and must be HTTPS, non-placeholder production values. |
| 3. Build-time frontend | `VITE_API_MODE`, `VITE_MOCK_ADAPTER_DELAY` | `VITE_API_MODE=live` for preview/production; `mock` is accepted only by Vite development. The delay is development-only. |
| 2. Backend-secret runtime | `DATABASE_URL`, `REDIS_URL`, `SUPABASE_SECRET_KEY`, `JWT_ACCESS_SECRET`, `AUTH_RATE_LIMIT_KEY_SECRET`, `USPTO_TSDR_API_KEY` | Render/approved operator only. Never prefix with `VITE_`, add to browser source maps, or print their values. |
| 4. Backend runtime | `NODE_ENV`, `PORT`, `DATABASE_SSL`, `DATABASE_POOL_MAX`, `DATABASE_IDLE_TIMEOUT_MS`, `DATABASE_CONNECTION_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, `HTTP_KEEP_ALIVE_TIMEOUT_MS`, `HTTP_HEADERS_TIMEOUT_MS`, `HTTP_REQUEST_TIMEOUT_MS`, `HTTP_MAX_HEADERS_COUNT`, `SUPABASE_URL`, `SUPABASE_JWT_VERIFICATION_MODE`, `SUPABASE_JWT_ALGORITHMS`, `SUPABASE_PUBLISHABLE_KEY`, `AUTH_RATE_LIMIT_ENABLED`, `AUTH_LOGIN_IP_LIMIT`, `AUTH_LOGIN_IDENTITY_LIMIT`, `AUTH_LOGIN_WINDOW_SECONDS`, `AUTH_RECOVERY_LIMIT`, `AUTH_RECOVERY_WINDOW_SECONDS`, `AUTH_REFRESH_LIMIT`, `AUTH_REFRESH_WINDOW_SECONDS`, `INVITE_TOKEN_TTL_SECONDS`, `WORKER_HEARTBEAT_TTL_SECONDS` | Backend-only; production validation is fail-closed. `SUPABASE_PUBLISHABLE_KEY` is needed only for `auth-server` JWT verification mode. |
| 5. Optional feature-gated runtime | `SEARCH_ENABLED`, `ELASTICSEARCH_URL`, `ELASTICSEARCH_INDEX`, `SEARCH_SOURCE_REGISTRIES`, `SEARCH_SOURCE_TIMEOUT_MS`, `SEARCH_MAX_RESULTS`, `OFFICE_ACTION_SEARCH_ENABLED`, `OFFICE_ACTION_SOURCE_REGISTRIES`, `OFFICE_ACTION_SOURCE_TIMEOUT_MS`, `OFFICE_ACTION_SEARCH_MAX_RESULTS`, `WATCH_ENABLED`, `WATCH_SCHEDULER_INTERVAL_MS`, `WATCH_POLL_INTERVAL_MINUTES`, `WATCH_SCHEDULER_BATCH_SIZE`, `PDF_EXPORT_ENABLED`, `PDF_EXPORT_QUEUE_KEY`, `PDF_EXPORT_STORAGE_PROVIDER`, `PDF_EXPORT_STORAGE_ROOT`, `PDF_EXPORT_MAX_BYTES`, `PDF_EXPORT_MAX_PAGES`, `PDF_EXPORT_MAX_RESULTS`, `PDF_EXPORT_MAX_ATTEMPTS`, `PDF_EXPORT_WORKER_INTERVAL_MS`, `PDF_EXPORT_WORKER_MAX_JOBS`, `USPTO_BULK_LISTING_URL` | Leave feature flags false for the initial launch and omit matching credentials/endpoints. Disabled worker entrypoints now stop without constructing or requiring their full runtime. |
| 6. Hosting-generated | `PORT` (Render), `NODE_VERSION` (Blueprint runtime selection) | Never hard-code Render’s listening port; the Blueprint pins Node 22.14.0. |
| One-off test/verification only | `TEST_DATABASE_URL`, `TEST_REDIS_URL`, `TEST_ELASTICSEARCH_URL`, `SUPABASE_TEST_ACCESS_TOKEN`, `IPRP_ALLOW_STAGING_AUTH_TEST`, `STAGING_API_URL`, `STAGING_ACCESS_TOKEN`, `STAGING_ADMIN_ACCESS_TOKEN`, `STAGING_MUTATION_ACCESS_TOKEN`, `STAGING_INVITATION_TOKEN`, `STAGING_SMOKE_ALLOW_MUTATIONS`, `STAGING_SMOKE_ALLOW_UNSAFE_URL`, `STAGING_SMOKE_TIMEOUT_MS`, `LOAD_TEST_BASE_URL`, `LOAD_TEST_ACCESS_TOKEN`, `LOAD_TEST_TOKEN`, `LOAD_TEST_PROFILE`, `ALLOW_PRODUCTION_LOAD_TEST`, `ALLOW_LOCAL_MOCK_LOAD_TEST`, `ALLOW_LARGER_LOAD_TEST`, `DASHBOARD_API_PATH` | Never set as application deployment variables. They are explicit, opt-in controls for isolated test environments and are outside this no-live-testing preparation. |

There is intentionally no root `.env.example`: the root has no environment
loader. Frontend and backend values have separate authority and delivery paths.

## Future upload gate

No upload endpoint is mounted, `multipart/form-data` is rejected globally, and
the frontend has no enabled upload navigation. A future upload feature must not
be enabled until a separately reviewed server-side implementation verifies
authentication and firm scope; business extension allowlists; magic bytes and
untrusted declared MIME; streamed size/count bounds; generated storage keys;
private quarantine storage; malware-scanner integration where required;
archive/SVG/HTML rejection; bounded parsers; safe attachment download headers;
audit events without object paths; rejected-file cleanup; and cross-firm
download tests. Browser validation alone is never a release control.

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
