# Production billing, registry, auth, and security handoff

## Delivered scope

This release adds a server-authoritative Paystack checkout and verification boundary, a daily idempotent USPTO trademark-ingestion schedule, explicit role landing routes, and tests for role and payment bypass attempts. It stays within the existing Node.js/Express/PostgreSQL/Redis and React/TypeScript stack.

The product's current registry schema and search experience are trademark-specific. Patent grant/application XML is a different corpus and must not be inserted into `registry_trademarks`. Adding patent search requires its own product contract, schema, parser fixtures, provenance, index, and UI ticket.

## Paystack activation

Keep `PAYSTACK_ENABLED=false` until all items below pass. Only Render receives the secret key; Vercel and `VITE_*` variables must never receive it.

```dotenv
PAYSTACK_ENABLED=true
PAYSTACK_MODE=live
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_STARTER_PLAN_CODE=PLN_...
PAYSTACK_STARTER_AMOUNT_SUBUNIT=...
PAYSTACK_STARTER_CURRENCY=NGN
PAYSTACK_PROFESSIONAL_PLAN_CODE=PLN_...
PAYSTACK_PROFESSIONAL_AMOUNT_SUBUNIT=...
PAYSTACK_PROFESSIONAL_CURRENCY=NGN
```

1. Create the recurring plans in the Paystack live dashboard. Make their amount, currency, and interval match the commercial terms.
2. Apply migration 015 through the approved production migration procedure.
3. Set the webhook URL to `https://iprp-api.onrender.com/api/v1/billing/webhook`.
4. Deploy with the feature disabled, verify health/readiness, then enable and restart.
5. Complete one controlled live checkout with a dedicated test firm. Confirm the transaction reference, amount, currency, tenant, and tier in PostgreSQL and the Paystack dashboard.
6. Replay the same callback/webhook and confirm no duplicate activation or transaction is created.
7. Confirm Attorney and Viewer requests to every `/api/v1/billing` administration endpoint return 403.

The backend determines plan code, price, currency, callback, firm, and role. It verifies Paystack after the browser callback and again after a correctly signed webhook. Signed subscription creation, non-renewal, disablement, invoice update, and payment-failure events are re-fetched from Paystack and matched to the configured customer, subscription, plan, amount, and currency before tenant state changes. Webhook HMAC uses the exact raw request bytes and duplicate payloads are recorded by digest. Card and bank details are never accepted or stored.

The key supplied in chat was not present in the received message and has not been written to any file. If any key has appeared in a screenshot, terminal transcript, chat, commit, or ticket, rotate it in Paystack before use.

## Registry operations

Render runs `pnpm ingest:uspto` daily at 07:15 UTC with a three-day overlap. The importer selects daily `apcYYMMDD.zip` trademark application files, uses a source/reference UPSERT key, and safely replays unchanged days. After a successful PostgreSQL import, run the separately controlled Elasticsearch projection before enabling search.

`USPTO_BULK_LISTING_URL` must be an authorized USPTO listing or an authorized mirror. Lack of US citizenship/residency is not handled by bypassing access controls or scraping restricted services. If no authorized feed is available, leave `SEARCH_ENABLED=false`; the rest of the application remains usable.

Operational cadence:

| Corpus | Product state | Cadence |
| --- | --- | --- |
| USPTO trademark application XML | Implemented importer | Daily, 07:15 UTC, replay prior 3 days |
| Elasticsearch trademark projection | Existing controlled command | After successful import; alert on backlog |
| USPTO patent application full text | Not in trademark product/schema | Commonly weekly; separate future ticket |
| USPTO patent grant full text | Not in trademark product/schema | Commonly weekly; separate future ticket |
| Other trademark registries | Adapter required | Follow each licensed/authorized source's publication SLA |

Monitor last successful feed date, files discovered, parsed/rejected counts, inserted/updated counts, and projection lag. Alert after two missed expected runs; backfill explicitly with `pnpm ingest:uspto -- --since YYYY-MM-DD`.

## Registration and authorization

- Create organization is a bootstrap flow and deliberately makes its creator the first Admin.
- A normal member joins only from a firm invitation. The Admin UI defaults new invitations to Viewer and may deliberately choose Attorney or Admin.
- Viewer lands on Dashboard, Attorney on Portfolio, and Admin on Users & Invitations.
- The browser never derives role or firm from Supabase metadata. `GET /me` resolves authoritative PostgreSQL membership.
- Same-origin redirect validation blocks open redirects. API middleware rechecks active membership, role, and firm for every protected operation; frontend guards are not the security boundary.
- Firm IDs, roles, prices, and actor IDs supplied by a browser are ignored or rejected where the server owns them. Cross-tenant IDs are scoped or hidden.

## Security verification

Strix, OWASP ZAP, Nuclei, Semgrep, Docker, and Podman were not available in the execution environment. The repository-native open-source alternatives used here are Node's test runner, Vitest, ESLint, TypeScript, dependency audit, migration/OpenAPI parity checks, secret scanning, production bundle scanning, and Supertest authorization tests. This is strong pre-deployment evidence, but it is not a substitute for an independent authenticated penetration test against a dedicated staging environment.

Run on Node 22 before promotion:

```sh
pnpm --dir backend check
pnpm --dir backend migration:check
pnpm --dir backend openapi:check
pnpm --dir backend test:unit
pnpm --dir backend security:secrets
pnpm --dir backend security:frontend-secrets
pnpm --dir frontend lint
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir backend audit --prod --audit-level high
pnpm --dir frontend audit --prod --audit-level high
```

Integration tests require disposable PostgreSQL, Redis, and Elasticsearch instances. Run them in CI/staging with the repository's `TEST_*` variables; do not point destructive fixtures at production.

## Production acceptance gates

Repository code is ready for review when all local checks pass. Production acceptance still requires external evidence: migration 015 applied, live Paystack plans and rotated live secret configured, signed webhook received, one controlled payment reconciled, authorized USPTO listing configured, cron observed, Elasticsearch projection current before search activation, Supabase redirect/email flows verified, and authenticated staging authorization/tenant tests completed.
