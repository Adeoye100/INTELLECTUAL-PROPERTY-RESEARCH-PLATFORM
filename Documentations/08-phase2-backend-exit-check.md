# BE-17 Phase 2 Backend Exit Check

## Scope and status

**Checked commit:** `0b84cb6b027d0d90c97b2b16f59d4fec210247e6` on `main` before
BE-17 changes. The worktree was clean before this check began. BE-16 is present
in that commit. No migration, live service, frontend code, billing code, or
Phase 3 work was run or changed.

**Honest exit status:** **Code-complete, staging verification pending**.

TRD §1 is a technology-stack specification; it does not enumerate HTTP
endpoints. The newer, explicit backend contract in
[`07-frontend-api-contracts.md`](07-frontend-api-contracts.md), the mounted
Express routes, and the BE-11 through BE-16 contracts are therefore the
canonical endpoint sources for this check. This resolves the only material
documentation conflict found: the opening historical text in the API register
described a backend refresh-session contract, while the later BE-15 contract
correctly makes Supabase the browser session/refresh authority. The historical
text has been reconciled; no backend refresh endpoint is required or mounted.

Completion values in this document are intentionally limited to: **Complete**,
**Code-complete, staging verification pending**, **Deferred by explicit
decision**, **Blocked**, and **Missing**. “Staging not run” below is evidence,
not a separate completion value.

## Common route controls

For routes with role checks, verified Bearer identity and resolved
PostgreSQL/Redis membership context execute before `requireRole` or
`requireFirm`; strict validation always completes before service work. Public
and bootstrap boundaries may apply IP limiting and cheap shape validation before
identity verification. The firm ID and actor ID come from `request.auth`, never
from a body/query field. Resource repository queries are firm-scoped and
cross-firm/missing records share the same 404. `app.js` mounts each listed
router before its terminal JSON 404 and error handler. The generic handler emits
only `INTERNAL_ERROR` for unexpected infrastructure failures; expected failures
use `AppError` codes and do not expose database, credentials, or stack details.

All collection parsing enforces documented bounds. The application-level route
inventory test provides the mount/method evidence with every optional runtime
service enabled through injected fakes; it avoids brittle Express-stack
inspection. It also fails if enabled search is unavailable.

| Control | Evidence |
|---|---|
| Authentication before authorization | `src/auth/middleware.js`; `supabase-auth-middleware.test.js`; `rbac.test.js` |
| Tenant identity cannot be body-controlled | Route adapters source `firmId`/`actorUserId` from `request.auth`; portfolio/watch/alert/user service tests reject supplied firm fields |
| Error and validation boundary | `src/errors.js`; route/service validation tests; `errorHandler` has no request-body/error-object logging |
| Bounded pagination and deterministic ordering | Portfolio, watch, alert, audit, and search query tests |
| No frontend-only authorization | Each role decision is enforced by Express middleware and service/repository scoping, not by UI visibility |

## Endpoint inventory

All entries marked “yes” under mount are mounted by `src/app.js` before the
terminal 404. Staging was not run because no disposable service URLs or staging
credentials were configured in the execution environment. Test names are unit
tests using fakes only.

| Requirement / ticket | Method and canonical path | Route module / mounted | Authentication and allowed roles | Firm-isolation behavior | Request validation | Response contract and stable error behavior | Unit-test coverage | Integration / staging | Completion and evidence |
|---|---|---|---|---|---|---|---|---|---|
| Auth invitation inspection (BE-05) | `GET /api/v1/auth/invitations/:token` | `auth-routes.js`; yes, `/api/v1/auth` | Public; recovery IP limiter executes first | Signed invitation determines firm; caller cannot choose it | Token handled by invitation service; no body | Safe invitation details; normalized application errors only | `auth-service.test.js`, `auth-rate-limiter.test.js`, route inventory | Not run; safe optional smoke requires an explicit invitation token | **Code-complete, staging verification pending** — mounted public invitation boundary |
| Auth invitation acceptance (BE-05) | `POST /api/v1/auth/invitations/:token/accept` | `auth-routes.js`; yes, `/api/v1/auth` | Public holder; recovery IP limiter | Firm and invited role are from the signed invitation, never body | Exact `{ fullName, email? }`; unknown fields rejected before service | `201` provisioning result; stable validation/auth errors | `auth-service.test.js`, `auth-rate-limiter.test.js`, route inventory | Not run; mutation is deliberately excluded from default smoke | **Code-complete, staging verification pending** — Supabase remains password authority |
| Firm bootstrap (BE-05) | `POST /api/v1/provisioning/firm` | `provisioning-routes.js`; yes, `/api/v1/provisioning` | Verified Supabase identity; no prior membership required | New firm is created server-side; body has no firm ID | Exact `{ firmName }`, limited before bootstrap service | `201` firm/user link; normalized `FIRM_ALREADY_EXISTS`/validation/auth failures | `provisioning-routes.test.js`, `provisioning-service.test.js`, route inventory | Not run; destructive bootstrap excluded from smoke | **Code-complete, staging verification pending** — bootstrap is intentionally distinct from tenant routes |
| Authenticated identity (BE-04/05) | `GET /api/v1/me` | `protected-routes.js`; yes, `/api/v1` | Bearer identity with resolved membership; Admin/Attorney/Viewer | Returns only resolved caller membership | No body/query | `200 { userId, email, role, firmId }`; `401 UNAUTHORIZED` without identity | `protected-routes.test.js`, route inventory | Not run | **Code-complete, staging verification pending** — no client-supplied membership accepted |
| Admin invitations (BE-05) | `POST /api/v1/admin/invitations` | `protected-routes.js`; yes, `/api/v1` | Authenticated **Admin**; IP rate limit then auth/RBAC | Issuer firm comes from membership; invitation service scopes recipient to it | Exact name/email/role schema before service | `201` invitation result; `401`, `403`, validation/rate-limit codes are normalized | `protected-routes.test.js`, `auth-rate-limiter.test.js`, route inventory | Not run; mutation excluded from smoke | **Code-complete, staging verification pending** — Admin-only enforcement is server-side |
| RBAC diagnostics | `GET /api/v1/admin/ping`, `/attorney/ping`, `/viewer/ping` | `protected-routes.js`; yes, `/api/v1` | Admin; Admin/Attorney; Admin/Attorney/Viewer respectively | No resource lookup | None | `200` diagnostic envelope; `401`/`403` from middleware | `protected-routes.test.js`, route inventory | Not run | **Code-complete, staging verification pending** — route-level RBAC proof endpoints |
| Firm-binding diagnostic | `GET /api/v1/firms/:firmId/ping` | `protected-routes.js`; yes, `/api/v1` | Authenticated membership | `requireFirm` compares path ID with resolved firm; other firm is `403` | Path UUID comparison via middleware | `200 { tenantBound: true }`; `403 FORBIDDEN` on mismatch | `protected-routes.test.js`, route inventory | Not run | **Code-complete, staging verification pending** — direct tenant-bound middleware proof |
| Search and federated partial responses (BE-09) | `GET /api/v1/search` | `search-routes.js`; yes when `SEARCH_ENABLED=true` | Authenticated Admin/Attorney/Viewer | Search is global registry read data; no client firm scope is accepted or exposed | Strict mark/registry/class/status/owner/date query allow-list and bounds before search service | `200 { results, sourceStatuses, partial, requestId }`; validation errors and stable `RISK_ENRICHMENT_FAILED` | `search-query.test.js`, `search-routes.test.js`, federated/runtime tests, route inventory | Not run; default smoke checks enabled search | **Code-complete, staging verification pending** — partial source status remains explicit |
| Confusion-risk enrichment (BE-10) | Embedded in `GET /api/v1/search` | `search-routes.js` + `risk-enriched-search-service.js`; yes with search | Same as search | No tenant-controlled score/snapshot inputs | Search parser runs before service; scorer validates deterministic inputs | Per-result provenance/methodology/evidence; no legal conclusion or internal relevance exposed | Risk calibration/similarity/enrichment tests; `search-routes.test.js` | Not run; requires staged registry data | **Code-complete, staging verification pending** — controlled source-failure staging proof remains required |
| Portfolio create (BE-11, BE-16) | `POST /api/v1/portfolio-marks` | `portfolio-mark-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney | `firmId`/actor derive from membership; body firm fields rejected | Strict create body, UUID/date/class/status limits before service | `201 PortfolioMark`; `400`, `409 PORTFOLIO_MARK_CONFLICT`, safe `500`; transactional `portfolio_mark.created` audit | `portfolio-marks.test.js`, `audit.test.js`, route inventory | Not run; controlled mutation smoke available only by opt-in | **Code-complete, staging verification pending** — transaction/audit rollback tests pass |
| Portfolio list (BE-11) | `GET /api/v1/portfolio-marks` | `portfolio-mark-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney/Viewer | Repository always predicates authenticated firm | Strict supported filters; page/pageSize bounded; deterministic order | `200 { items, pagination }`; safe validation errors | `portfolio-marks.test.js`, route inventory | Not run; default smoke reads one page | **Code-complete, staging verification pending** — Viewer read-only path tested |
| Portfolio get (BE-11) | `GET /api/v1/portfolio-marks/:id` | `portfolio-mark-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney/Viewer | Firm-scoped lookup; missing/cross-firm both `404 PORTFOLIO_MARK_NOT_FOUND` | UUID path before service | `200 PortfolioMark`; no existence leak | `portfolio-marks.test.js`, route inventory and firm regression | Not run | **Code-complete, staging verification pending** — IDOR concealment tested |
| Portfolio update (BE-11, BE-16) | `PATCH /api/v1/portfolio-marks/:id` | `portfolio-mark-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney | Authenticated firm/actor only | UUID plus non-empty allowed mutable fields | `200 PortfolioMark`; `404` hides cross-firm; transactional `portfolio_mark.updated` audit | `portfolio-marks.test.js`, `audit.test.js`, route inventory | Not run; opt-in smoke update only applies to same-run record | **Code-complete, staging verification pending** — before/after snapshots tested |
| Portfolio delete (BE-11, BE-16) | `DELETE /api/v1/portfolio-marks/:id` | `portfolio-mark-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney | Firm-scoped delete; no body tenant override | UUID path before service | `204`; cross-firm/missing is `404`; transactional `portfolio_mark.deleted` audit | `portfolio-marks.test.js`, `audit.test.js`, route inventory | Not run; opt-in smoke only deletes returned same-run UUID | **Code-complete, staging verification pending** — no success event on failure |
| Watch create (BE-12, BE-16) | `POST /api/v1/watches` | `watch-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney | Firm/actor derive from membership; associated mark is firm-scoped | Exact create fields, UUID/state/interval bounds | `201 Watch`; mark/watches cross-firm lookups are `404`; transactional `watch.created` audit | `watch-service.test.js`, `audit.test.js`, route inventory | Not run; mutation excluded by default | **Code-complete, staging verification pending** — client tenant fields rejected |
| Watch list (BE-12) | `GET /api/v1/watches` | `watch-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney/Viewer | Repository predicates authenticated firm | Bounded filters/pagination | `200 { items, pagination }`; safe validation errors | `watch-service.test.js`, route inventory | Not run; default smoke reads one page | **Code-complete, staging verification pending** — Viewer is read-only |
| Watch get (BE-12) | `GET /api/v1/watches/:id` | `watch-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney/Viewer | Firm-scoped lookup; missing/cross-firm identical 404 | UUID path | `200 Watch`; `WATCH_NOT_FOUND` is non-disclosing | `watch-service.test.js`, route inventory | Not run | **Code-complete, staging verification pending** — IDOR test coverage present |
| Watch update/transition (BE-12, BE-16) | `PATCH /api/v1/watches/:id` | `watch-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney | Firm/actor come from membership | Strict non-empty mutable state/interval fields | `200 Watch`; state transition audits as `watch.enabled`/`watch.disabled`, otherwise `watch.updated` | `watch-service.test.js`, `audit.test.js`, route inventory | Not run | **Code-complete, staging verification pending** — bounded state transitions and audit taxonomy tested |
| Watch delete (BE-12, BE-16) | `DELETE /api/v1/watches/:id` | `watch-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney | Firm-scoped delete | UUID path | `204`; no cross-firm disclosure; transactional `watch.deleted` audit | `watch-service.test.js`, `audit.test.js`, route inventory | Not run | **Code-complete, staging verification pending** — transaction rollback tests pass |
| Watch scheduling/queue processing boundary (BE-12/13) | No client HTTP route; enabled worker runtime | `watch-runtime.js`, queue/worker modules; constructed by `system.js` only when `WATCH_ENABLED=true` | Server-internal only | Jobs carry validated firm/watch/mark UUIDs and repository checks scope | Minimal versioned job schema; invalid/duplicate/stale jobs are skipped safely | No client response; bounded failure codes and no network-created job API | `watch-service.test.js` queue/scheduler/processor cases | Not run; readiness requires enabled worker | **Code-complete, staging verification pending** — no frontend queue authorization assumption |
| Alert list (BE-13) | `GET /api/v1/alerts` | `alert-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney/Viewer | Firm-scoped repository list | Strict filters/pagination before service | `200 { items, pagination }`; safe validation errors | `alerts.test.js`, route inventory | Not run; default smoke reads one page | **Code-complete, staging verification pending** — no alert evidence internals exposed |
| Alert get (BE-13) | `GET /api/v1/alerts/:id` | `alert-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney/Viewer | Firm-scoped lookup; missing/cross-firm both `404 ALERT_NOT_FOUND` | UUID path before service | `200 Alert`; no IDOR leak | `alerts.test.js`, route inventory | Not run | **Code-complete, staging verification pending** — 404 concealment covered |
| Alert status mutation (BE-13, BE-16) | `PATCH /api/v1/alerts/:id` | `alert-routes.js`; yes, `/api/v1` | Authenticated Admin/Attorney | Firm/actor from membership | Exact action `read` or `dismiss`, UUID path, strict legal state transition | `200 Alert`; transactional `alert.read` or `alert.dismissed` audit; invalid state/action is stable `400` | `alerts.test.js`, `audit.test.js`, route inventory | Not run | **Code-complete, staging verification pending** — no reopen route exists, so no fabricated `alert.reopened` action |
| Audit-log retrieval (BE-16) | `GET /api/v1/audit-logs` | `audit-log-routes.js`; yes, `/api/v1` | Authenticated **Admin** only | Firm is always membership-derived; list SQL predicates it | UUID/action/entity/timestamp/cursor/page size checked; page size 25 default, 100 maximum | `200 { auditLogs, nextCursor }`, `occurredAt DESC, id DESC`; Attorney/Viewer `403`, malformed filters safe `400` | `audit.test.js`, phase-2 authorization matrix, route inventory | Not run; default smoke uses Admin token | **Code-complete, staging verification pending** — no audit mutation route exists |
| User role change (BE-16) | `PATCH /api/v1/users/:id/role` | `user-routes.js`; yes, `/api/v1` | Authenticated **Admin** only | Target user is selected in actor firm; cross-firm target becomes `USER_NOT_FOUND` | Exact `{ role }`, role enum, UUID path before service | `200 { id, role, active }`; no-op/last-admin guard errors are stable; transactional `user.role_changed` audit | `audit.test.js`, phase-2 authorization matrix, route inventory | Not run; role mutation intentionally excluded from smoke | **Code-complete, staging verification pending** — `users.role` remains authoritative and resolver cache is invalidated |
| Browser refresh/session boundary (BE-15) | No backend endpoint; configured Supabase client | Supabase client boundary; no Express mount by design | Supabase manages browser sign-in/refresh/logout; API verifies Bearer token | Membership/role is independently resolved server-side after token verification | Supabase verifier rejects malformed/expired/wrong issuer/audience tokens | Normalized `401` for invalid/missing Bearer token; no server session/cookie secrets exposed | `supabase-verifier.test.js`, `supabase-auth-middleware.test.js`, config/rate-limit tests | Not run; real-token validation is a staging gate | **Code-complete, staging verification pending** — no competing local refresh API is required |
| Subscription and billing (BE-14) | No canonical method/path is defined or mounted | No route module; no app mount | Not applicable | Not applicable | Not applicable | No contract is claimed | No BE-14 test claimed | Not run by explicit scope | **Deferred by explicit decision** — BE-14 remains intentionally deferred, not complete |

### Frontend planning candidates and later work

The older register also names dashboard, password-reset/email-verification,
portfolio import/attachments, office-action, matters, reporting/PDF, and
session inventory candidates. The register explicitly labels them frontend
expectations rather than authoritative backend routes. TRD §1 does not make
them endpoint requirements, so inventing routes would be out of scope. In
particular, PDF generation remains BE-20; BE-16 supplies only the server-only
export audit hook that BE-20 must call. This exit check makes no completion
claim for those candidates.

## Authorization regression evidence

`backend/test/unit/phase2-route-inventory.test.js` is the consolidated
application-level regression matrix. It verifies all canonical, non-deferred
mounted methods with enabled fake search and proves they return a route result
rather than terminal 404. It also verifies:

- unauthenticated protected reads return `401`;
- Admin reads audit logs and changes roles;
- Attorney mutates portfolio/watches/alerts but receives `403` for audit logs
  and role changes;
- Viewer can read search, portfolio, watches, and alerts but receives `403` for
  those mutations;
- a cross-firm portfolio lookup returns `404`, and a body `firmId` is rejected
  before service invocation.

Existing focused tests supply the deeper test evidence: `rbac.test.js`,
`protected-routes.test.js`, `portfolio-marks.test.js`, `watch-service.test.js`,
`alerts.test.js`, `audit.test.js`, `auth-rate-limiter.test.js`, and
`supabase-auth-middleware.test.js`. The rate limiter tests prove sensitive
boundaries fail closed when Redis fails, preserving authentication behavior;
they do not permit a failed limiter to become an authentication bypass.

## Staging smoke runner and infrastructure gates

`pnpm --dir backend test:staging-smoke` is opt-in and never included in the
normal test command. It requires `STAGING_API_URL`, `STAGING_ACCESS_TOKEN`, and
`STAGING_ADMIN_ACCESS_TOKEN`; it rejects localhost and hosts that do not look
like staging/test environments unless an operator intentionally sets
`STAGING_SMOKE_ALLOW_UNSAFE_URL=true`. It has a 5-second default timeout,
15-second maximum, rejects redirects before a credential can be forwarded, sends only GETs by default, reports only test names/status
codes/stable error codes, and never prints tokens, passwords, cookies, request
bodies, or full response bodies. Optional invitation inspection needs a supplied
test invitation token.

Mutation coverage additionally requires both `STAGING_SMOKE_ALLOW_MUTATIONS=true`
and `STAGING_MUTATION_ACCESS_TOKEN`. It creates a uniquely labelled portfolio
record, captures only that returned ID in memory, patches it, and deletes only
that UUID. A missing or malformed create-response UUID fails the smoke check
without attempting cleanup. It cannot run migrations, billing, role demotion, index deletion, or
destructive infrastructure operations.

`pnpm --dir backend phase2:readiness` reuses `loadConfig` without creating
clients or contacting any service. It reports deployment gates for:

| Component | Required Phase 2 staging condition |
|---|---|
| PostgreSQL | Valid `DATABASE_URL`; migrations applied to disposable staging |
| Redis | Valid `REDIS_URL`; rate limiting and role/queue paths reachable in staging |
| Supabase Auth | Valid URL, verifier mode/algorithm configuration, server secret, and authenticated real-token verification |
| Secrets | Valid `JWT_ACCESS_SECRET` and separate 32-byte `AUTH_RATE_LIMIT_KEY_SECRET` |
| Search | `SEARCH_ENABLED=true`, credential-free bounded Elasticsearch URL, source registries, and controlled partial-source-failure proof |
| Watch worker | `WATCH_ENABLED=true`, with search enabled and scheduler/queue/processor path observed |

No such configuration variables, disposable integration URLs, or staging
credentials were provided to this exit check. Therefore integration and staging
commands were skipped; those omissions are deployment gates, not unit-test
failures.

## Migration reconciliation

No migration was applied or database contacted. The runner executes lexical
filenames with advisory lock/checksum protection. There are no duplicate numeric
prefixes and no new migration was introduced by BE-17.

| Order | Migration | Dependency / reconciliation result |
|---:|---|---|
| 001 | `create_firms_and_users.sql` | Creates `user_role`, `firms`, then `users`; establishes firm/user roots |
| 002 | `create_registry_trademarks.sql` | Independent registry source table after database extensions/conventions exist |
| 003 | `create_firm_invitations.sql` | References `firms` and `users` from 001 |
| 004 | `add_supabase_user_identity.sql` | Non-destructive `users` identity-link extension after 001 |
| 005 | `allow_supabase_only_users.sql` | Non-destructive compatibility relaxation for Supabase-managed passwords |
| 006 | `create_portfolio_marks.sql` | Additive/repeat-safe table referencing 001 roots; **treat as unapplied absent external evidence** |
| 007 | `create_watches.sql` | Additive/repeat-safe watch table after portfolio composite key; **treat as unapplied absent external evidence** |
| 008 | `create_risk_scores_and_alerts.sql` | Additive/repeat-safe evidence/alerts after watches and portfolio keys; **treat as unapplied absent external evidence** |
| 009 | `create_audit_logs.sql` | Additive/repeat-safe audit table after firms/users; append-only trigger; **treat as unapplied absent external evidence** |

Foreign keys are correctly ordered: 007 depends on 006; 008 depends on 006/007;
009 depends only on 001. Migrations 006–009 are additive and use `IF NOT
EXISTS`/guarded DDL where repeatability is required. No destructive migration
was introduced. The schema document was updated to distinguish historical 004–005
compatibility alterations from the additive 006–009 deployment set.

## Lightweight security exit review

| Area | Result / evidence | Scoped correction |
|---|---|---|
| Authentication bypass | Supabase token verifier checks issuer, audience, expiry, asymmetric algorithm; middleware then resolves membership | No code defect found |
| RBAC order | Route inventory and RBAC tests show identity middleware before `requireRole`; roles are server-enforced | No code defect found |
| Firm isolation / IDOR | Tenant adapter inputs come from `request.auth`; repository SQL scopes firm; cross-firm paths use 404 | No code defect found |
| Brute-force/rate-limit fail-open | Sensitive auth limiter emits `503 AUTH_RATE_LIMIT_UNAVAILABLE` when Redis fails; tests cover boundary counters and spoofed forwarded addresses | No code defect found |
| Audit immutability | Migration 009 trigger rejects updates/deletes; repository exposes insert/read only | No code defect found; migration application remains gate |
| Secrets / unsafe errors | Audit sanitizer redacts nested secret keys, blocks prototype-pollution keys, error handler avoids bodies/error objects | Reconciled stale API-register refresh wording; no runtime change required |
| Bounds | JSON body 16 KB; list/query/page, audit cursor, search, array and audit payload bounds are validated | No code defect found |
| Elasticsearch/runtime URL SSRF | Config requires credential-free HTTP(S) Elasticsearch URL and bounded registry settings; no user URL is accepted | No code defect found |
| Queue job validation | Minimal versioned jobs validate UUIDs and malformed/duplicate/stale jobs are skipped before search | No code defect found |
| Dependency audit | An attempted package-manager advisory check produced no offline advisory result and attempted its registry endpoint despite `--offline`; it was blocked and not repeated | Operational dependency-scanning gate |

## Verification record and remaining gates

Automated checks run after BE-17 changes:

```text
pnpm --dir backend check       PASS (115 JavaScript files syntax checked)
pnpm --dir backend test:unit   PASS (212 tests, 51 suites, 0 failures)
```

Integration tests were skipped: disposable PostgreSQL, Redis, and Elasticsearch
test URLs were not configured. Staging smoke tests were skipped: the required
explicit staging URL and test credentials were not configured. No live
infrastructure, migrations, or credentials were used. The package advisory
attempt noted above did not produce a usable result and was the only blocked
registry-access attempt; no further network audit was run.

Remaining operational gates only:

1. Apply migrations 006–009 to a disposable staging database and record the
   migration-run evidence.
2. Set and validate PostgreSQL, Redis, Supabase, JWT/rate-limit secret, search,
   and watch-worker configuration using `phase2:readiness`.
3. Verify real authenticated tokens, role/firm behavior, search responses,
   controlled partial registry failure, Redis limiter/worker behavior, and all
   non-deferred smoke paths in staging.
4. Reconcile frontend callers to the canonical API contracts before a live
   frontend integration claim.
5. Complete BE-14 billing or obtain a formal exception for a fully complete
   Phase 2 exit. Until then BE-14 remains **Deferred by explicit decision**.

This is not another BE-16 implementation ticket and does not represent BE-14
as complete. Once the listed disposable-staging checks pass and the BE-14
exception is formally accepted, update this evidence rather than starting
Phase 3 work under BE-17.

BE-18 adds Office Action code and an unapplied migration `010`, but it does not
resolve, execute, or change any existing Phase 2 staging gate or the BE-14
exception status.

BE-19 adds immutable search snapshot code and an unapplied migration `011`. It
does not resolve, execute, or change any existing Phase 2/BE-18 staging gate or
the BE-14 exception status.
