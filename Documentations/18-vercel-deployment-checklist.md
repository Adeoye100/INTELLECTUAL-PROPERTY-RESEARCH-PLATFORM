# Vercel deployment checklist

## Project configuration

The single authoritative frontend configuration is
[`frontend/vercel.json`](../frontend/vercel.json), the configuration filename
Vercel consumes for this project. Vercel must use `frontend` as its **Root
Directory**. Do not duplicate rewrites or headers in the Vercel dashboard.

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Node runtime | Select the currently supported **22.x** line in **Project Settings → Build and Deployment → Node.js Version**. The repository’s `.node-version` and Render target are 22.14.0; Vercel manages minor/patch updates, so record the selected major and build evidence. |
| Install Command | `corepack enable && pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build` |
| Output Directory | `dist` |
| Framework | Vite |
| SPA routing | Root rewrite to `/index.html`; verify static JS/CSS/image requests remain served as static assets in preview. |

The production build turns off Vite source maps. It runs TypeScript, Vite, then
`security:bundle`; the final check rejects backend-secret variable names and
localhost/placeholder endpoints in `frontend/dist`. A bad public environment
configuration halts the build rather than producing a fallback/mock deployment.

## Environment separation

In **Project → Settings → Environment Variables**, define only these browser
safe values for the relevant Vercel target. Use different values for Preview and
Production; never promote a preview URL automatically into production settings.

| Variable | Preview | Production | Safe in browser? |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Intended Supabase project HTTPS origin | Intended Supabase project HTTPS origin | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Matching browser publishable key | Matching browser publishable key | Yes |
| `VITE_API_BASE_URL` | Exact approved Render preview/staging HTTPS origin ending `/api/v1` | Exact Render production HTTPS origin ending `/api/v1` | Yes |
| `VITE_API_MODE` | `live` | `live` | Yes |
| `VITE_AUTH_REDIRECT_ORIGIN` | Exact explicitly approved preview origin, or omit to fall back to the canonical production origin | `https://fgiprp.com` | Yes |

Do not add `DATABASE_URL`, Supabase secret/service-role keys, JWT/rate-limit
secrets, Redis/Elasticsearch/storage URLs or credentials, registry/provider
keys, or internal storage paths to Vercel. Production OAuth callbacks are pinned to `https://fgiprp.com` by default.
`VITE_AUTH_REDIRECT_ORIGIN` is an optional browser-safe override for an
explicitly approved preview origin; never point production at a `.vercel.app`
hostname. Repo-root Vercel deployments are non-canonical and must redirect to
`https://fgiprp.com` instead of serving repository files.

Before assigning a preview, choose its exact Vercel deployment URL and add the
same exact origin to Render `CORS_ALLOWED_ORIGINS` and the three Supabase Auth
redirect entries. No broad `*.vercel.app` redirect or CORS rule is permitted.

## Security headers and CSP

`frontend/vercel.json` adds the production headers from one location:

- `Content-Security-Policy` starts with `default-src 'self'`, blocks objects,
  framing, foreign scripts, and `unsafe-eval`; it limits `connect-src` to the
  configured Supabase and Render API origins.
- `style-src 'self' 'unsafe-inline'` is the one documented exception, retained
  for current React/Recharts inline style attributes. It is not a script
  exception. Remove it after a UI refactor proves charts/progress components no
  longer need inline styles.
- `img-src` allows same-origin, `data:`, and `blob:` for expected application
  assets; `worker-src` permits same-origin/blob workers. There is no wildcard
  source.
- HSTS, `nosniff`, referrer policy, permissions policy, and frame denial are
  also sent. `frame-ancestors 'none'` is the CSP source of truth.

Production requests to `fgiprp.com` receive the strict exact-origin `connect-src` policy above. Vercel preview hosts receive the same defensive baseline but allow HTTPS connections so their environment-specific Supabase and API origins remain usable. Preview deployment protection, exact Render CORS entries, and exact Supabase redirect allowlists remain mandatory; do not treat the broader preview `connect-src` as production policy.

In preview, verify login/signup/recovery callback flows, Recharts/SVG screens,
static assets, downloadable PDFs when that later feature is enabled, and browser
console CSP reports. Only add a directive after naming the exact source and
recording why it is needed. Do not add a second CSP in Vercel dashboard headers
or a framework config.

## Deployment checks

- [ ] Confirm the build contains an explicit Render API origin—not localhost,
  a root-relative API path, or a Vercel rewrite proxy.
- [ ] Inspect `frontend/dist` with the supplied bundle scan before deployment.
- [ ] Confirm all `/auth/*` deep links, dashboard direct access, public landing
  page, and 404/error routes work through the SPA rewrite.
- [ ] Test public/anonymous routes and authenticated Admin, Attorney, and
  Viewer sessions with dedicated non-sensitive accounts. The first profile
  intentionally directs each role to Dashboard and reports incompatible
  workflows as unavailable.
- [ ] Confirm logout/session expiry clears React Query and auth in-memory state;
  protected pages do not flash before resolution.
- [ ] Confirm a browser cannot send its Supabase Bearer token to any origin
  other than the configured API base. The centralized client accepts only
  root-relative paths below that base, uses `credentials: 'omit'`, and bounds
  timeouts/retries.
- [ ] Run `pnpm verify:production` from `frontend`. Configure the optional
  `IPRP_ADMIN_TOKEN`, `IPRP_ATTORNEY_TOKEN`, and `IPRP_VIEWER_TOKEN` only as
  short-lived GitHub Actions secrets for authenticated role evidence; never
  commit or print them. The anonymous SPA/header/CORS/API checks always run.
