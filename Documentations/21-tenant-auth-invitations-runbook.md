# Tenant authentication, invitations, and roles

## Onboarding

There are two deliberately separate flows.

1. **Create organization** (`/auth/create-organization`) is the sole self-service path that creates a firm. It explicitly says that its authenticated creator becomes the first Administrator. The browser first obtains a short-lived, opaque server-stored organization intent; the server binds its firm name and normalized email, verifies the confirmed Supabase identity, consumes the intent once, then creates the firm and first Admin atomically. `forge_signup_firm_name` is written only as descriptive Supabase signup metadata for this flow; it is never authorization input.
2. **Join an existing firm** (`/auth/invite/:token`) displays the invited firm, email, role, and expiry. It creates or signs into Supabase first, preserves the opaque invitation route through verified-email callback, and only then calls the authenticated redemption API.

Ordinary sign-in never provisions a firm. `/auth/signup` is a backwards-compatible redirect to Create organization, not Request access.

## Roles

| Role | Capabilities |
| --- | --- |
| Admin | Dashboard, firm-scoped operational features when enabled, Users & Invitations, role and invitation management. |
| Attorney | Dashboard and enabled firm research/case-work features; never users, invitations, or firm administration. |
| Viewer | Dashboard and read-only enabled firm information; no mutation or administration. |

The frontend capability map and route guard provide usable navigation and permission-denied feedback. The API remains the authority: all member and invitation management routes require a verified membership and Admin role, and every query is scoped to `request.auth.firmId`.

## Invitation lifecycle

`POST /api/v1/admin/invitations` issues a single opaque token to a normalized email and selected `admin`, `attorney`, or `viewer` role. List endpoints never return token material. A firm cannot issue a pending duplicate invitation or invite an existing member. Resend creates a new record/token and supersedes the prior record. Revoke marks a pending invitation unavailable. Redemption locks and revalidates the invitation in one PostgreSQL transaction, checks the authoritative confirmed Supabase email, writes the Supabase user ID and membership, consumes the invitation, and writes an audit event. Redis role cache invalidation follows redemption and role changes.

The production endpoint is `POST /api/v1/auth/invitations/:token/redeem`. The removed pre-auth `/accept` behavior must not be restored.

## Required configuration

Render/backend variables (backend-only unless labelled public):

```dotenv
PUBLIC_FIRM_SIGNUP_ENABLED=false
ORGANIZATION_INTENT_TTL_SECONDS=3600
PUBLIC_APP_URL=https://intellectual-property-research-plat.vercel.app
INVITATION_MAILER_PROVIDER=resend
INVITATION_MAILER_API_KEY=...              # backend secret only
INVITATION_MAILER_FROM=IPRP <no-reply@example.com>
```

`INVITATION_MAILER_PROVIDER=disabled` is safe and makes issue/resend fail clearly. `fake` is deterministic test/development-only. The current concrete provider adapter is Resend; do not expose its API key to Vercel or the browser. The mailer generates only `PUBLIC_APP_URL/auth/invite/<opaque-token>` links, escapes HTML-controlled names, and provides plain text.

Vercel variable:

```dotenv
VITE_PUBLIC_FIRM_SIGNUP_ENABLED=false
```

The backend flag is authoritative. A frontend flag never grants firm creation.

Supabase Auth must allow these exact redirect URLs (including configured preview/local URLs where appropriate):

```text
https://intellectual-property-research-plat.vercel.app/auth/verify-email
https://intellectual-property-research-plat.vercel.app/auth/callback
https://intellectual-property-research-plat.vercel.app/auth/reset-password
```

## Deployment and rollback

1. Deploy backend code with `PUBLIC_FIRM_SIGNUP_ENABLED=false` and email delivery configured.
2. Apply `pnpm --dir backend migrate` only through the approved production migration procedure.
3. Deploy frontend with `VITE_PUBLIC_FIRM_SIGNUP_ENABLED=false`.
4. Confirm Admin invitation issue, verified redemption, Attorney/Viewer denial, and no raw token in logs.

Rollback application code only after keeping migration 014 in place; it is additive. Disable public organization creation and invitation mail delivery if a security issue is suspected. Do not roll back by deleting tenants, users, invitation records, or audit records.

Local checks:

```sh
pnpm --dir backend migration:check
pnpm --dir backend check
pnpm --dir backend test:unit
pnpm --dir frontend lint
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir backend security:secrets
pnpm --dir backend security:frontend-secrets
```

## Accidental test firm: read-only diagnosis only

Do not automatically delete, merge, or relink firm `97ec8647-8745-4d0a-8ac2-14135a846e16` or any associated production user. Run the following only against an approved read-only production connection during a reviewed incident response:

```sql
SELECT * FROM firms WHERE id = '97ec8647-8745-4d0a-8ac2-14135a846e16';
SELECT id, email, role, supabase_user_id, created_at, last_login_at FROM users WHERE firm_id = '97ec8647-8745-4d0a-8ac2-14135a846e16';
SELECT * FROM portfolio_marks WHERE firm_id = '97ec8647-8745-4d0a-8ac2-14135a846e16';
SELECT * FROM watches WHERE firm_id = '97ec8647-8745-4d0a-8ac2-14135a846e16';
SELECT * FROM alerts WHERE firm_id = '97ec8647-8745-4d0a-8ac2-14135a846e16';
SELECT * FROM exports WHERE firm_id = '97ec8647-8745-4d0a-8ac2-14135a846e16';
SELECT * FROM firm_invitations WHERE firm_id = '97ec8647-8745-4d0a-8ac2-14135a846e16';
SELECT * FROM audit_logs WHERE firm_id = '97ec8647-8745-4d0a-8ac2-14135a846e16' ORDER BY occurred_at DESC;
```

Before any remediation, inventory all foreign keys referencing `firms` and `users`, capture a reviewed backup, decide the desired membership ownership, and execute a separately approved remediation plan. This implementation performs no production correction.
