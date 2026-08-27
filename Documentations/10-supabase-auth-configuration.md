# Supabase authentication configuration

The browser uses Supabase for email/password sessions and Google OAuth only. Application role and firm membership always come from the backend's authenticated `GET /api/v1/me` request, never from Supabase metadata.

## BE-15 platform-side brute-force protection

Browser login, signup, password recovery/resend, refresh, and logout call
Supabase Auth directly. They cannot be intercepted by Express middleware, so
configure and verify Supabase/platform-side abuse protection, rate limits, and
monitoring for the deployed project. The backend's separate
`auth-rate-limit-policy-v1` covers only backend-owned invitation and firm
provisioning endpoints. Do not send raw emails, access tokens, refresh tokens,
or full IP addresses to application logs when monitoring either boundary.

## Required Supabase Dashboard configuration

In **Authentication → Providers**, enable:

- Email
- Google

Do not enable other OAuth providers for this application.

In **Authentication → URL Configuration**, add these development redirect URLs exactly:

- `http://localhost:5173/auth/callback`
- `http://localhost:5173/auth/verify-email`
- `http://localhost:5173/auth/reset-password`

Add the same three paths for every deployed frontend origin. Keep the production **Site URL** on the canonical deployed frontend origin, never on a backend URL. Google Cloud's OAuth redirect URI remains the Supabase callback URL supplied by the provider configuration; the application redirect URLs above are passed to Supabase by the frontend.

The frontend supplies these paths through `authRedirectUrl` for Google sign-in, sign-up confirmation, email verification, and password reset. Query parameters such as `/auth/callback?next=/dashboard` stay on the approved callback path.

## Staging-only verification

Do not run this during repository preparation or against production. It creates
and deletes a disposable Supabase user, so it requires a separately approved,
isolated staging Supabase/Redis/PostgreSQL environment and dedicated test
credentials. The current initial-deployment procedure is
[19](19-initial-deployment-runbook.md); its non-destructive checks are in
[20](20-post-deployment-smoke-checklist.md).

When that staging gate is explicitly approved, load an isolated environment
file—not the developer’s general `backend/.env`—and set the explicit staging
opt-in:

```sh
IPRP_ALLOW_STAGING_AUTH_TEST=true node --env-file=path/to/isolated-staging.env \
  frontend/scripts/verify-supabase-live-auth.mjs
```

The verifier creates and removes a disposable confirmed Supabase user and local firm. It proves real email/password login, persisted-session restoration, token refresh, logout, CORS preflight, backend `/me`, provisioning, 401 rejection for an unusable bearer, and 403 role denial. Cross-firm checks remain an injected-fake/unit and staged smoke requirement. It prints only pass/fail summaries and never prints credentials, access tokens, email addresses, or firm IDs.

Supabase's public Auth settings endpoint reports enabled sign-in providers but deliberately does not expose the URL allow-list. The redirect URLs therefore require the dashboard configuration above (or a Supabase Management API token with project-config access) and a final browser redirect check.
