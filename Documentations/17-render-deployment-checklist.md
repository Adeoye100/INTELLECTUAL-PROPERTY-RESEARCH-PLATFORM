# Render deployment checklist

## Blueprint and API service

`render.yaml` is the repository’s single initial-deployment Blueprint. It
defines only the API web service and deliberately has `autoDeploy: false`.
Workers are not declared, so a Blueprint sync cannot accidentally start them.

| Setting | Required value / action |
| --- | --- |
| Repository root / service root | Repository root with Render `rootDir: backend`. |
| Runtime | Node, `NODE_VERSION=22.14.0`; `backend/package.json` declares Node `>=22.13.0 <23`. Confirm Render’s current supported Node setting before launch. |
| Build | `corepack enable && pnpm install --frozen-lockfile`. Do not use an unfrozen install. |
| Start | `pnpm start` (`node src/server.js`), not `pnpm dev`; no file watcher or startup migration. |
| Bind/listen | The API binds `0.0.0.0` and uses Render’s `PORT`. |
| Health check | Configure `/healthz` as the Render health-check path. It proves process liveness only. |
| Dependency readiness | `/readyz` checks PostgreSQL and Redis and returns only `ready` or a safe `NOT_READY` response. Do not make it the Render restart health check: a dependency outage should not create restart loops. |
| Shutdown | SIGTERM/SIGINT stops accepting connections, drains Redis/PostgreSQL, and has a 25-second deadline. Verify during staging. |
| Deploy control | Keep auto deploy off until the controlled runbook authorizes the candidate commit. Record commit ID/release ID. |

In the Render dashboard, select **New → Blueprint** for the reviewed repository
(or create one Node web service with the exact values above). Do not set Render’s
root directory to `frontend` or the repository root when using the Blueprint.

## API environment group / secrets

Create a least-privilege environment group only after the Supabase/Redis work
is approved. `render.yaml` declares names and `sync: false`, never values.
Set real values in **Service → Environment** or an approved Render environment
group, not in Git.

| Category | Names | Notes |
| --- | --- | --- |
| Required server secrets | `DATABASE_URL`, `REDIS_URL`, `SUPABASE_SECRET_KEY`, `JWT_ACCESS_SECRET`, `AUTH_RATE_LIMIT_KEY_SECRET` | Server-only; mark secret; do not share with Vercel. |
| Required configuration | `NODE_ENV=production`, `DATABASE_SSL=true`, pool timeouts, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS=1`, `SUPABASE_URL`, `SUPABASE_JWT_VERIFICATION_MODE=jwks`, `SUPABASE_JWT_ALGORITHMS=ES256` | Startup rejects production TLS/proxy/origin violations and placeholder values. |
| Initial feature gates | `SEARCH_ENABLED=false`, `OFFICE_ACTION_SEARCH_ENABLED=false`, `WATCH_ENABLED=false`, `PDF_EXPORT_ENABLED=false` | Leave every optional credential absent while the matching gate is false. |
| Future-only secrets | Elasticsearch credentials, Office Action provider key, storage credentials, Redis queue worker credentials | Do not add until a separate change and staging gate authorizes the feature. |

Use the exact comma-separated `CORS_ALLOWED_ORIGINS` list of approved frontend
origins, for example the production origin and one named preview deployment if
needed. The parser accepts 1–20 origin-only HTTPS values in production, rejects
wildcards/paths/duplicates, and CORS does not reflect arbitrary origins. Because
Render is the single trusted proxy, production requires exactly
`TRUST_PROXY_HOPS=1`; reassess this if an additional proxy/CDN is inserted.

## Network, timeouts, and headers

- [ ] Confirm the chosen Supabase connection mode and TLS certificate handling
  before adding `DATABASE_URL`. The `pg` pool is bounded (default 10) with
  5-second connection, 30-second idle, and 15-second statement/query limits;
  adjust from observed staging load only.
- [ ] Configure a TLS Redis endpoint (`rediss:` in production). Redis is
  required for the API’s role/firm cache and brute-force/rate controls even
  though queue workers are disabled.
- [ ] Confirm Render client IP forwarding with a staging rate-limit test. The
  application trusts one proxy hop and does not trust a spoofed request header
  beyond that boundary.
- [ ] Confirm body, header, URL, request-ID, and JSON limits; multipart and
  other non-JSON bodies are rejected with safe 415 behavior. There is no upload
  endpoint in the initial release.
- [ ] Verify API headers include no-sniff, CSP deny-by-default, frame denial,
  HSTS, referrer, permissions, and cross-origin policies without interfering
  with the approved Vercel CORS flow.
- [ ] Ensure Render logs/redaction rules never retain Authorization headers,
  JWTs, passwords, connection strings, Supabase keys, or export storage keys.

## Workers remain off

Do **not** create a background worker service in the initial deployment. Once
all listed prerequisites are verified in staging, create separate Render
**Background Worker** services—never a web-process child worker—with:

| Worker | Command | Preconditions |
| --- | --- | --- |
| Watch | `pnpm watch:worker` | Applied migrations, TLS Redis, search provider/index/reprojection, `SEARCH_ENABLED=true`, `WATCH_ENABLED=true`, monitoring/heartbeat/queue alerts. |
| PDF export | `pnpm pdf-export:worker` | Applied migrations, TLS Redis, a shared private storage adapter, `PDF_EXPORT_ENABLED=true`, integrity/download tests, storage/queue monitoring. |

The existing production config intentionally refuses filesystem PDF storage, so
there is no valid PDF-worker deployment until that adapter is supplied. Workers
require the same server-only database/Supabase/Redis secrets but no browser
values. Define each service’s owner, alert route, restart policy, and deploy
commit independently.

## Staging evidence to collect before promotion

- Render build and start logs with redaction verified.
- `/healthz` response and `/readyz` safe readiness status, neither containing
  topology, database name, URLs, credentials, or stack trace.
- Controlled SIGTERM drain observation.
- Exact CORS success from an allowed Vercel preview and rejection from an
  unapproved origin.
- Rate-limit client-IP behavior behind Render’s proxy.
- PostgreSQL connection-pool metrics, Redis readiness, and API error redaction.

See [Render health checks](https://render.com/docs/health-checks), [Blueprint
specification](https://render.com/docs/blueprint-spec), and [environment
variables](https://render.com/docs/environment-variables) for the dashboard
labels/current product behavior. Those links do not constitute evidence that a
Render service has been created.
