# FE-21 Frontend API Contract Register

## Status and evidence

Originally inspected on 2026-08-05 when `backend/` contained only `package.json`.
The current backend adds Express routes, PostgreSQL migrations, Redis-backed
rate limiting/queues, RBAC middleware, and injected-store tests. Supabase Auth
is now the password, refresh-token, and browser-session authority; the backend
does not expose a competing refresh-session endpoint. This is repository
implementation evidence only: no staging deployment is claimed, and frontend
contract reconciliation is still required before FE-21 calls routes live.

The paths below are the existing frontend/MSW contract candidates, consistently
rooted at the documented `/api/v1` base path. Unless an entry explicitly records
the BE-03/BE-04 implementation, the path is not evidence that a backend route
exists. MSW fixtures remain isolated-development aids and return mock data only.

## Transport contract required from the backend

- Live deployments must set `VITE_API_BASE_URL` to a root-relative value or an HTTP(S) URL ending in `/api/v1`; absolute non-development URLs must use HTTPS and protocol-relative URLs are rejected.
- `VITE_API_MODE` defaults to `live`. Only an explicit `VITE_API_MODE=mock` in a Vite development build starts MSW; non-development builds reject mock mode.
- Protected requests send `Authorization: Bearer <access-token>`, `Accept: application/json`, and JSON bodies with `Content-Type: application/json`.
- The client times out ordinary requests after 15 seconds and PDF generation after 30 seconds. The backend must make idempotency/retry guarantees explicit for mutations before automatic mutation retries are added.
- A `401` received while an access token is present clears the client session and navigates to sign-in. Browser sign-in, refresh, recovery, and logout use the configured Supabase client directly; there is deliberately no backend refresh-token, rotation, or cookie endpoint. Supabase configuration and real-token behavior remain staging gates.
- Expected error shape is `{ code?: string, message?: string, details?: unknown, requestId?: string }`, except an authentication rate-limit rejection which is `{ error: { code, message } }`. The frontend normalizes 400/409/422, 401, 403, 404, 429, 5xx, network, timeout, cancellation, invalid JSON, and invalid content types. The authoritative error-code catalog is unresolved.
- Successful JSON responses must use `application/json` or a `+json` media type. Successful empty responses use `204`.
- Tenant authorization, role authorization, object-level authorization, rate limits, pagination, sorting, filtering limits, audit behavior, and idempotency remain backend-owned even where the UI hides an action.

## Candidate endpoint contracts used by the frontend

The provisioning and invitation entries below are implemented in the frontend
and backend. Deployment still requires matching Supabase provider, redirect URL,
and environment configuration.

| Candidate route | Request shape | Expected response shape | Intended role rule | Unresolved backend contract |
|---|---|---|---|---|
| `POST /api/v1/provisioning/firm` | Implemented: `{ firmName }` plus verified Supabase Bearer token | Implemented: `201` linked Admin user and firm info | Authenticated Supabase identity with no local membership | First firm user is Admin; normalized-name matches return `409 FIRM_ALREADY_EXISTS`; no password reaches the backend |
| `GET /api/v1/auth/invitations/:token` | Invitation token in path | `{ email, firmName, role, mocked? }` | Public holder of single-use token | Token format/expiry, disclosure rules, accepted/revoked states |
| `POST /api/v1/auth/invitations/:token/accept` | `{ fullName }` | Provisioning info | Public holder of valid token | Atomic seat allocation and existing-account handling; Supabase owns the password |
| `POST /api/v1/auth/password-reset` | `{ email }` | `202 { accepted: true }` | Public | Anti-enumeration wording, throttling, delivery guarantees |
| `GET /api/v1/auth/password-reset/:token` | Reset token in path | `{ valid: true }` | Public holder of token | Whether validation should be a non-mutating POST, token disclosure/caching controls |
| `POST /api/v1/auth/password-reset/:token` | `{ password }` | `204` | Public holder of valid token | Session revocation, password rules, single-use transaction semantics |
| `GET /api/v1/auth/verify-email/:token` | Verification token in path | `{ verified: true }` | Public holder of token | GET mutation semantics, redirects, caching, already-used behavior |
| `POST /api/v1/auth/verify-email/resend` | `{ email }` | `202 { accepted: true }` | Public or authenticated unverified user | Anti-enumeration and throttling |
| `GET /api/v1/dashboard/summary` | No body; candidate `scenario` query exists only in MSW | `DashboardSummary` | Admin, Attorney, Viewer within firm | Aggregate definitions, time zone/range, freshness, partial-section identifiers |
| `GET /api/v1/dashboard/analytics?range=7d|30d|90d` | Normalized range (default `30d`) | Firm-scoped cached aggregate with portfolio risk/status/renewal counts and watch activity points | Admin, Attorney, Viewer within verified firm | Redis key is firm UUID + normalized range, TTL 60s; cache failure safely falls back to PostgreSQL; `cacheStatus` is informational and not real-time |
| `GET /api/v1/search` | Query: `mark`, repeated `jurisdiction`, comma-separated `class`, `status`, `owner`, `filedFrom`, `filedTo` | Implemented BE-19 `SearchResponse`: `{ searchId, results, sourceStatuses, partial, requestId }`. Every result uses that immutable `searchId` and includes risk evidence with `conceptualScore: null`; `owner` and `filingDate` may be `null`. Elasticsearch `relevanceScore`, raw responses, and legal conclusions are not exposed. | Admin, Attorney, Viewer | The server persists the normalized result/evidence snapshot transactionally before responding |
| `GET /api/v1/search-results` | Optional `requestedByUserId`, `createdFrom`, `createdTo`, `partial`, `pageSize`, `cursor` | `{ searchResults, nextCursor }` summaries only | Admin firm-wide; Attorney/Viewer own history only | Bounded cursor pagination, `createdAt DESC, id DESC`; no result arrays in list rows |
| `GET /api/v1/search-results/:id` | UUID path parameter | Exact historical normalized query, results, source statuses, methodology versions, request ID, and creation time | Admin, Attorney, Viewer in firm | Firm-scoped; never reruns Elasticsearch or recalculates risk |
| `POST /api/v1/portfolio/import` | Not implemented; deferred | — | — | Search import is outside P2-01 and absent from the active UI |
| `GET /api/v1/portfolio-marks` | Implemented canonical list; see BE-11 contract below | `200 { items, pagination }` | Admin, Attorney, Viewer within firm | P2-01 frontend uses this paginated contract |
| `POST /api/v1/portfolio-marks` | Implemented canonical create; see BE-11 contract below | `201 PortfolioMark` | Admin, Attorney | Transactional BE-16 audit event included |
| `GET /api/v1/portfolio-marks/:id` | UUID path parameter | `200 PortfolioMark` | Admin, Attorney, Viewer in same firm | No status-history endpoint in BE-11 |
| `PATCH /api/v1/portfolio-marks/:id` | Non-empty mutable-field subset | `200 PortfolioMark` | Admin, Attorney | Transactional BE-16 audit event included |
| `DELETE /api/v1/portfolio-marks/:id` | UUID path parameter | `204` | Admin, Attorney | Backend route exists, but P2-01 UI withholds deletion because restrictive dependent foreign keys require a separate lifecycle decision |
| `GET /api/v1/portfolio/:markId/attachments` | Mark ID in path | `PortfolioAttachment[]` | Admin, Attorney, Viewer in same firm | Storage metadata, malware state, pagination, retention |
| `GET /api/v1/portfolio/:markId/attachments/:attachmentId/download` | IDs in path | Current mock shape `{ downloadUrl, fileName, mocked? }` | Admin, Attorney, Viewer in same firm | Direct authenticated blob vs short-lived URL, content-type/disposition, URL TTL, download audit; current frontend fixture is not a live contract |
| `POST /api/v1/portfolio/:markId/watch` | Not implemented; no convenience alias | — | — | Canonical BE-12 route is `/api/v1/watches` |
| `GET /api/v1/watches` | Implemented; see BE-12 contract below | `200 { items, pagination }` | Admin, Attorney, Viewer within firm | Frontend contract migration remains separate work |
| `POST /api/v1/watches` | Implemented; see BE-12 contract below | `201 Watch` | Admin, Attorney | Transactional BE-16 audit event included |
| `PATCH /api/v1/watches/:id` | Non-empty state/interval subset | `200 Watch` | Admin, Attorney | No alert policy is configured here |
| `GET /api/v1/watches/:id` | UUID path parameter | `200 Watch` | Admin, Attorney, Viewer within firm | Implemented BE-12 |
| `DELETE /api/v1/watches/:id` | UUID path parameter | `204` | Admin, Attorney | Transactional hard delete and audit event |
| `GET /api/v1/alerts` | Implemented canonical list; see BE-13 contract below | `200 { items, pagination }` | Admin, Attorney, Viewer within firm | No outbound delivery behavior in BE-13 |
| `GET /api/v1/alerts/:id` | UUID path parameter | `200 Alert` | Admin, Attorney, Viewer within firm | Implemented BE-13 |
| `PATCH /api/v1/alerts/:id` | `{ action: 'read' \| 'dismiss' }` | `200 Alert` | Admin, Attorney | Strict state transitions only |
| `GET /api/v1/office-actions/search` | Implemented canonical BE-18 search; see contract below | `OfficeActionSearchResponse` | Admin, Attorney, Viewer | Feature-gated; no live provider is bundled |
| `POST /api/v1/office-actions/link` | Not a canonical backend route | — | — | Replaced by nested portfolio-mark Office Action reference routes |
| `GET /api/v1/matters` | No body | `Matter[]` | Admin, Attorney, Viewer within firm | Entire route; frontend currently uses local storage instead of this mock handler |
| `POST /api/v1/matters` | Candidate `{ name, clientRef? }` | `201 Matter` | Admin, Attorney | Entire create contract, required client/firm data, audit event |
| `POST /api/v1/matters/:matterId/risk-results` | `MatterSaveRequest` risk snapshot | `MatterSaveResult` | Admin, Attorney | Snapshot authority, versioning, idempotency, whether browser-supplied scores are accepted (they should not be authoritative) |
| `POST /api/v1/reports/pdf` | `PdfReportRequest`: one of search-results context, risk-detail context, or portfolio-summary context | Required frontend target: direct non-empty `application/pdf` blob with `Content-Disposition` filename | Authenticated user authorized for every referenced firm/matter/search/result/mark; Viewer export permission unresolved | Route existence, accepted IDs, synchronous vs job model, filename encoding, size/time limits, error model |

Type definitions referenced above live in `frontend/src/types/index.ts`; PDF request variants live in `frontend/src/components/PdfExport.tsx`. These are frontend expectations, not an authoritative schema.

## BE-11 implemented Portfolio Marks contract

`/api/v1/portfolio-marks` is the canonical Portfolio Marks route family. The
earlier `/api/v1/portfolio` entries were planning/mock candidates and are not a
parallel backend endpoint. All five routes require `Authorization: Bearer
<access-token>` and use application/json where a body is present.

| Role | List/Get | Create/Update/Delete |
|---|---:|---:|
| Admin | Yes | Yes |
| Attorney | Yes | Yes |
| Viewer | Yes | No |

The server derives the firm solely from the verified server-side membership.
Clients must not send `firmId` or `firm_id`; those fields are rejected as
unknown. Every object query includes that derived firm. A missing ID and an ID
owned by a different firm both return `404 PORTFOLIO_MARK_NOT_FOUND`.

Create (`POST`) requires:

```json
{
  "markText": "FORGE GLOBAL",
  "jurisdiction": "US",
  "sourceRegistry": "USPTO",
  "registryReference": "12345678",
  "niceClasses": [9, 42],
  "status": "registered",
  "filingDate": "2020-01-02",
  "registrationDate": null,
  "renewalDate": null
}
```

`markText`, `jurisdiction`, `sourceRegistry`, `registryReference`,
`niceClasses`, and `status` are required. The dates may be omitted or `null`;
when supplied they are real `YYYY-MM-DD` calendar dates. Nice classes are
unique integer values from 1 through 45. Status is one of `pending`, `filed`,
`registered`, `abandoned`, `expired`, or `cancelled`. `registryReference` is a
genuine registry registration/application reference supplied by the client; the
API never creates a replacement reference.

`PATCH` accepts a non-empty subset of those fields. It rejects unknown fields
and server-managed identifiers, firm IDs, creator IDs, and timestamps. A
successful create/get/update response is:

```json
{
  "id": "uuid",
  "firmId": "uuid",
  "ownerUserId": "uuid-or-null",
  "markText": "FORGE GLOBAL",
  "jurisdiction": "US",
  "sourceRegistry": "USPTO",
  "registryReference": "12345678",
  "niceClasses": [9, 42],
  "status": "registered",
  "filingDate": "2020-01-02-or-null",
  "registrationDate": "2021-03-01-or-null",
  "renewalDate": "2031-03-01-or-null",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp"
}
```

The list response is `{ items: PortfolioMark[], pagination: { page, pageSize,
total, totalPages } }`. It defaults to `page=1` and `pageSize=25`, caps page at
100,000 and page size at 100, and orders records by newest creation timestamp
then descending ID. Supported filters are bounded case-insensitive literal `query`, `status`, `jurisdiction`,
`sourceRegistry`, exact `registryReference`, `niceClass`, `renewalAfter`, and
`renewalBefore` (the date filters use `YYYY-MM-DD`).

Stable errors are `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN`
(403), `PORTFOLIO_MARK_NOT_FOUND` (404), `PORTFOLIO_MARK_CONFLICT` (409), and
`INTERNAL_ERROR` (500). The conflict is the same firm's duplicate
`sourceRegistry`/`registryReference`; SQL and tenant details are not exposed.

The backend has a transactional hard-delete operation, but P2-01 does not expose it in the UI. Watches, risk scores, alerts, and Office Action references use restrictive foreign keys, so dependency-safe deletion or archival requires a separate reviewed lifecycle decision. BE-16 adds redacted audit entries for
successful Portfolio Mark mutations before production activation. This ticket
does not connect marks to risk analyses, watches, alerts, or exports.

The migration is `backend/migrations/006_create_portfolio_marks.sql`. It is not
run automatically; apply it to the intended database with `DATABASE_URL=... pnpm
--dir backend migrate`.

## BE-12 implemented Watch contract

`/api/v1/watches` is the sole canonical Watch API; `/portfolio/:markId/watch`
is not implemented as a parallel convenience route. Every request uses the
authenticated server-side firm membership, never a client-provided `firmId` or
`firm_id`. Object operations always scope by that firm. Missing/cross-firm
watches return `404 WATCH_NOT_FOUND`; inaccessible requested marks return
`404 PORTFOLIO_MARK_NOT_FOUND`.

| Role | List/Get | Create/Update/Delete |
|---|---:|---:|
| Admin | Yes | Yes |
| Attorney | Yes | Yes |
| Viewer | Yes | No |

Create body is `{ "portfolioMarkId": "uuid", "state": "enabled",
"pollIntervalMinutes": 1440 }`; only `portfolioMarkId` is required. State is
`enabled` or `paused`, interval is an integer 5–43,200, and the server default
is `WATCH_POLL_INTERVAL_MINUTES`. New enabled watches are due immediately;
paused watches have a null `nextPollAt`. PATCH accepts a non-empty subset of
`state` and `pollIntervalMinutes` only. IDs, firm/owner fields, poll metadata,
and timestamps are immutable.

```json
{
  "id": "uuid",
  "firmId": "uuid",
  "portfolioMarkId": "uuid",
  "ownerUserId": "uuid-or-null",
  "state": "enabled",
  "pollIntervalMinutes": 1440,
  "nextPollAt": "ISO-8601-or-null",
  "lastPolledAt": null,
  "lastPollStatus": null,
  "lastErrorCode": null,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

List shape is `{ items: Watch[], pagination: { page, pageSize, total,
totalPages } }`, newest first (`created_at DESC, id DESC`), default page 1 and
page size 25, maximum page 100,000 and page size 100. `state` and
`portfolioMarkId` are the only filters.

Errors are `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
`WATCH_NOT_FOUND`/`PORTFOLIO_MARK_NOT_FOUND` (404), `WATCH_CONFLICT` (409 for a
duplicate enabled watch), and `INTERNAL_ERROR` (500). Database, Redis, tenant,
credential, and mark-text details never appear in errors.

The polling worker is separate from HTTP and uses `queue:watch_ingest`. Its
versioned, at-least-once job is `{ version: 1, jobId, watchId, firmId,
portfolioMarkId, scheduledFor, attempt }`; deterministic IDs plus Redis
deduplication and processing locks make duplicate delivery safe. The scheduler
only enqueues enabled due watches and advances their schedule only after success.
Processor outcomes retain search request ID, source status, partial state,
results, and risk evidence internally. Partial search is a completed partial
poll. BE-13 persists immutable evidence and alerts from this outcome without
adding outbound notifications.

## BE-13 implemented Alert contract

`GET /api/v1/alerts`, `GET /api/v1/alerts/:id`, and `PATCH /api/v1/alerts/:id`
are the canonical firm-scoped alert routes. Admin and Attorney may read, mark
read, or dismiss; Viewer may only list/get. Firm comes exclusively from server
membership. Every query/mutation scopes by it, and missing/cross-firm records
return `404 ALERT_NOT_FOUND`.

The list response is `{ items: Alert[], pagination: { page, pageSize, total,
totalPages } }`, ordered newest first. Filters: `status` (`unread`, `read`,
`dismissed`), `severity` (`medium`, `high`), `watchId`, `portfolioMarkId`, and
`createdFrom`/`createdTo` (`YYYY-MM-DD`). Pagination defaults to page 1 and 25
items, bounded by 100,000 and 100.

Each Alert includes IDs, severity/status/policy/timestamps, and a `riskScore`
with attributed candidate source, genuine registry reference, candidate text,
Visual/Phonetic/Class/Composite scores, nullable `conceptualScore`, rating,
methodology version, evidence, source request ID, and observation time. API
responses omit fingerprints, Elasticsearch relevance, candidate internal IDs,
SQL fields, and legal conclusions.

PATCH is exactly `{ "action": "read" }` for `unread → read` or
`{ "action": "dismiss" }` for `unread/read → dismissed`; invalid inputs are
400 and invalid transitions are `409 ALERT_STATE_CONFLICT`.

Risk fingerprints are canonical SHA-256 values scoped to firm/watch. Identical
replays return existing snapshot/alert records; materially changed complete
evidence may create a new snapshot. Policy `watch-alert-policy-v1.0.0` emits
High/Medium alerts only; Low, invalid, unattributed, and unavailable-source
entries do not generate alerts. Partial sources can still yield valid alerts.

The worker writes evidence/alerts before successful poll state and returns a
retryable persistence failure if that transaction fails. Migration
`008_create_risk_scores_and_alerts.sql` is manual: `DATABASE_URL=... pnpm --dir
backend migrate`. BE-16 audit logging is required before production alert-state
mutations; BE-13 sends no notifications.

`WATCH_ENABLED=false` is the default. The other strict settings are
`WATCH_SCHEDULER_INTERVAL_MS=60000`, `WATCH_POLL_INTERVAL_MINUTES=1440`, and
`WATCH_SCHEDULER_BATCH_SIZE=50`. When enabled, run the separate worker with
`pnpm --dir backend watch:worker`; it requires the existing search runtime.
Migration `007_create_watches.sql` is not automatic; use `DATABASE_URL=... pnpm
--dir backend migrate` deliberately. BE-16 redacted audit logging remains a
production gate for Watch mutations.

## BE-15 authentication rate-limit contract

The backend owns `POST /api/v1/provisioning/firm`, public invitation lookup and
redemption under `/api/v1/auth/invitations/:token`, and Admin invitation
issuance. These flows use `auth-rate-limit-policy-v1`, a distributed Redis
limiter. `GET /api/v1/me` is authenticated but is not covered by this auth
limiter. There are no backend login, registration-password, recovery/resend,
refresh, logout, or session-revocation endpoints to call.

Browser sign-in, password recovery/resend, token refresh, and logout go directly
to Supabase Auth. Those requests do not traverse Express and therefore require
Supabase/platform-side rate-limiting and brute-force protections at deployment.
The client must not infer account or session existence from recovery responses.

Policy values are `loginIp` 20 / 900 seconds, `loginIdentity` 5 / 900,
`recoveryIp`/`recoveryIdentity` 5 / 3,600, `refreshSession` 30 / 300, and
`logoutIp` 60 / 60. A `429` has `Retry-After`, `RateLimit-Limit`,
`RateLimit-Remaining`, and delta-seconds `RateLimit-Reset` headers and exactly:

```json
{
  "error": {
    "code": "AUTH_RATE_LIMITED",
    "message": "Too many authentication attempts. Try again later."
  }
}
```

Sensitive auth flows fail closed with `503 AUTH_RATE_LIMIT_UNAVAILABLE` if Redis
is unavailable. A future backend logout/revocation route must remain available
with a sanitized warning under the `logoutIp` policy. Keys use only
`auth-limit:v1:{policy}:{hmac}` with an HMAC-SHA256 identifier; IPs, emails,
tokens, and session IDs are neither exposed nor stored as raw Redis key data.
`TRUST_PROXY_HOPS=0` is the direct-connection default; production must configure
the exact trusted reverse-proxy hop count so untrusted `X-Forwarded-For` values
are ignored. BE-15 needs no migration. BE-14 remains deferred and BE-16 audit
logging is still required before production-sensitive auth mutations sign off.

## Required contracts with no candidate route

The product documents require these capabilities, but selecting HTTP methods or paths now would invent a live API. The backend must publish them in an OpenAPI specification before integration:

| Capability | Required request/response decisions | Role rule |
|---|---|---|
| Session inventory and bulk/device revocation | Device/session model, inventory fields, current-session vs all-device revocation | Current user; Admin scope for firm-wide revocation is unresolved |
| Authoritative onboarding status | Per-user completion flags derived from stored searches/portfolio records, update/reconciliation rules | Authenticated current user |
| Firm member list | Pagination and user/seat/role status fields | Admin only |
| Invite, revoke invitation, remove seat, change role | Target identifiers, allowed transitions, seat-limit conflicts, audit metadata | Admin only (invite is explicitly Admin-only in app flow) |
| Subscription and usage | Provider-neutral plan, renewal, seat/search/watch usage, billing portal action | Admin only |
| Notifications | In-app unread count, delivery preferences, read/seen semantics | Authenticated user; preference mutation scope unresolved |
| Attachment upload/delete | Multipart/direct-upload flow, limits, malware scanning, retention, audit | Admin/Attorney mutation; Viewer read-only |
| Report job/status/download if asynchronous | Job creation, polling/events, expiry and authorized download | Same object-level authorization as report request |

## PDF ownership boundary

The frontend only submits typed screen context, waits, validates `application/pdf`, derives a safe fallback filename or uses the server `Content-Disposition` filename, creates a temporary browser object URL, and exposes loading/failure/retry states. The backend owns authoritative data reconstruction, generation, storage, encryption, tenant/object authorization, retention/expiry, rate limiting, and immutable export lifecycle audit logging. Browser-supplied IDs or display values must never be treated as authorization or authoritative legal data.

## Verification gates before any live integration is declared

1. A backend application and versioned routes exist in this repository or an explicitly linked service repository.
2. An authoritative OpenAPI contract defines requests, responses, errors, authentication, role and tenant rules.
3. Backend route and authorization tests pass, including cross-tenant non-disclosure.
4. The frontend contract module is reconciled to that specification rather than to MSW fixtures.
5. Integration tests pass against seeded staging data, and the tested environment/version is recorded.

## BE-16 implemented audit and role contracts

BE-16 is code-complete; its migration has not been applied. It changes no
frontend code and adds two backend contracts.

| Method and path | Request | Response | Roles | Notes |
|---|---|---|---|---|
| `GET /api/v1/audit-logs` | Optional `actorUserId`, `action`, `entityType`, `entityId`, `occurredFrom`, `occurredTo`, `pageSize`, `cursor` | `{ auditLogs, nextCursor }` | Admin | Firm is always inferred from verified membership |
| `PATCH /api/v1/users/:id/role` | Exactly `{ "role": "admin" \| "attorney" \| "viewer" }` | `{ id, role, active }` | Admin | Target is firm-scoped; cross-firm targets are hidden |

Audit logs are newest first by `occurredAt DESC, id DESC`. `pageSize` defaults
to 25 and is at most 100. `nextCursor` is opaque and must be supplied unchanged
to continue. Every optional UUID, timestamp, action, entity type, cursor, and
page-size value is strictly validated; malformed requests use the stable audit
validation codes and never expose database failures. Attorney and Viewer access
to the list receives the standard `403 FORBIDDEN`. There are no client-facing
audit creation, update, or deletion routes.

Each list item is:

```json
{
  "id": "uuid",
  "actorUserId": "uuid",
  "action": "watch.disabled",
  "entityType": "watch",
  "entityId": "uuid or null",
  "beforeState": {},
  "afterState": {},
  "metadata": { "changedFields": ["state"] },
  "requestId": "string or null",
  "ipAddress": "string or null",
  "userAgent": "string or null",
  "occurredAt": "ISO-8601"
}
```

Supported actions are `portfolio_mark.created`, `portfolio_mark.updated`,
`portfolio_mark.deleted`, `watch.created`, `watch.updated`, `watch.deleted`,
`watch.enabled`, `watch.disabled`, `alert.read`, `alert.dismissed`,
`user.role_changed`, `export.requested`, `export.completed`, and
`export.failed`. Supported entity types are `portfolio_mark`, `watch`, `alert`,
`user`, and `export`. The current alert API cannot reopen alerts, so it has no
`alert.reopened` event.

All current Portfolio Mark, Watch, and Alert status mutations are audited
transactionally. Rejected validation, authorization, missing-resource, and
cross-firm requests create no event. Actor and firm are never read from request
bodies. Audit snapshots preserve relevant legal state (including real registry
references), contain no complete request body, and redact password/token/header/
cookie/secret/key/JWT/session values recursively. The request context preserves
a valid existing request ID or uses a generated one. Its IP uses Express proxy
trust configuration only; raw `X-Forwarded-For` is never trusted.

Role changes update the authoritative `users.role` column. Supabase claims are
not used for application roles, so the response does not wait for an external
identity-provider update; the existing Redis role/firm resolver is invalidated
inside the successful workflow. A no-op role is rejected. The firm must retain
one active Admin; an Admin may demote themselves only if another active Admin
remains. `USER_NOT_FOUND` intentionally covers cross-firm target IDs.

There is no BE-20 export endpoint or PDF generation in this release. BE-20 must
call the server-only `ExportAuditService.requested`, `.completed`, and `.failed`
hooks. It must pass only export/job UUID, type, output format, a bounded safe
filter summary, and a stable failure code. Files, generated content, signed URLs,
tokens, and result sets are not accepted by that hook. Retention/archival of the
append-only audit table remains an operational decision.

The remaining operational gates are controlled migration application, database
permission/backup review, exact reverse-proxy trust configuration, audit-write
monitoring, and a retention/archive policy. They are deployment gates, not
additional BE-16 implementation work.

## BE-17 Phase 2 backend exit reconciliation

The traceable backend exit matrix is
[`08-phase2-backend-exit-check.md`](08-phase2-backend-exit-check.md). It treats
the candidate rows above as frontend planning evidence unless a later canonical
backend contract marks a route implemented. It confirms the mounted,
non-deferred Phase 2 API surface with application-level route and authorization
tests; no frontend code was changed for that check.

BE-17 is **code-complete, staging verification pending**. Its opt-in smoke
runner requires a named non-local `STAGING_API_URL`, separate read/Admin test
tokens, bounded timeout, and explicit mutation consent. It defaults to GET
requests and deletes only the UUID returned by a same-run, uniquely labelled
portfolio-mark create. The no-network `pnpm --dir backend phase2:readiness`
command reports configuration gates for PostgreSQL, Redis, Supabase, required
secrets, search, and the watch worker.

BE-14 subscription/billing remains **Deferred by explicit decision**. It is not
represented as a completed backend route or a Phase 2 staging pass.

## BE-18 implemented Office Action research contract

`GET /api/v1/office-actions/search` is available only when the backend receives
an injected Office Action source adapter and `OFFICE_ACTION_SEARCH_ENABLED=true`.
It requires a Bearer-authenticated Admin, Attorney, or Viewer. Search accepts a
non-empty combination of `applicationNumber`, `markText`, `owner`, `filedFrom`,
`filedTo`, repeated `documentType`, repeated `jurisdiction`, and `maxResults`.
Dates are strict calendar dates, ranges are ordered, collections contain at most
ten values, and `maxResults` is bounded by the configured maximum (25 by
default). `firmId` and unsupported/nested query fields are rejected.

The normalized internal source query is:

```json
{
  "applicationNumber": "88/123456 or null",
  "markText": "FORGE or null",
  "owner": "Owner or null",
  "filedFrom": "YYYY-MM-DD or null",
  "filedTo": "YYYY-MM-DD or null",
  "documentTypes": ["non_final_office_action"],
  "jurisdictions": ["US"],
  "maxResults": 25
}
```

The response is `{ results, sourceStatuses, partial, requestId }`. Results
preserve genuine `sourceRegistry` and `sourceReferenceId`, nullable source
fields as `null`, document attribution, and only allow-listed source metadata
(`documentTitle`, `documentLanguage`, `sourceRecordType`, `sourceUpdatedAt`). A
source timeout, malformed response, or network failure becomes that source's
`{ status: "unavailable", resultCount: 0 }`; healthy source results remain in
configured source and provider-result order. Duplicate records are removed only
when both registry and genuine source reference match. No source payload, stack
trace, generated summary, legal conclusion, or recommendation is returned.

No licensed live Office Action adapter is bundled. The injected source interface
is `{ sourceName, searchOfficeActions: async (query) => [] }`; it has no
construction-time network call. Configuring a real adapter and proving registry
licensing/provenance remains an operational gate.

The canonical linked-reference resource is nested under the authenticated
firm's portfolio mark:

| Method and path | Roles | Contract |
|---|---|---|
| `POST /api/v1/portfolio-marks/:portfolioMarkId/office-action-refs` | Admin, Attorney | Creates an attributed genuine registry reference; returns `201` |
| `GET /api/v1/portfolio-marks/:portfolioMarkId/office-action-refs` | Admin, Attorney, Viewer | Returns `{ items, pagination }`; page size is at most 100 |
| `GET /api/v1/portfolio-marks/:portfolioMarkId/office-action-refs/:id` | Admin, Attorney, Viewer | Returns one reference |
| `PATCH /api/v1/portfolio-marks/:portfolioMarkId/office-action-refs/:id` | Admin, Attorney | Corrects bounded summary/date/metadata fields; source registry/reference and tenant identity are immutable |
| `DELETE /api/v1/portfolio-marks/:portfolioMarkId/office-action-refs/:id` | Admin, Attorney | Returns `204` and uses the same scoped deletion convention as portfolio marks |

Create requires `sourceRegistry`, genuine non-empty `sourceReferenceId`,
`documentType`, and explicit `summaryMethod` (`registry`, `manual`, or
`extracted`). It accepts only bounded application/date/examiner/summary/document
URL and allow-listed metadata fields. Plain-text summaries are optional research
assistance: `registry` identifies source-provided text, while `manual` and
`extracted` are not labelled as verbatim examiner statements. BE-18 performs no
AI summarization, does not invent reasoning/statutes/deadlines, and provides no
legal conclusion or advice.

The server derives firm and actor exclusively from verified membership. Missing
or cross-firm portfolio marks are `404 PORTFOLIO_MARK_NOT_FOUND`; a missing or
cross-firm nested reference is `404 OFFICE_ACTION_REF_NOT_FOUND`; duplicate
provenance links are `409 OFFICE_ACTION_REF_CONFLICT`. Create/update/delete
share a transaction with audit events `office_action_ref.created`, `.updated`,
and `.deleted` (`entityType: office_action_ref`). Snapshots contain only bounded
reference fields and allow-listed metadata, never raw documents or credentials.
Migration `010_create_office_action_refs.sql` was not applied.

## BE-19 immutable search-result contract

`GET /api/v1/search` remains the canonical execution route for authenticated
Admin, Attorney, and Viewer users. BE-19 adds a top-level `searchId` without
removing the established `results`, `sourceStatuses`, `partial`, or `requestId`
fields:

```json
{
  "searchId": "uuid",
  "results": [{
    "id": "source-scoped internal candidate identifier",
    "searchId": "same uuid",
    "candidateMarkText": "FORGE GLOBAL",
    "candidateSource": "USPTO",
    "candidateRef": "genuine registry reference",
    "owner": null,
    "jurisdiction": "US",
    "niceClasses": [9, 42],
    "filingDate": null,
    "status": "registered",
    "riskAnalysis": { "conceptualScore": null, "methodology": {}, "matchedMarkRefs": [] }
  }],
  "sourceStatuses": [{ "source": "USPTO", "status": "complete", "resultCount": 1 }],
  "partial": false,
  "requestId": "bounded request ID"
}
```

`searchId` is a persistent snapshot UUID, not an Elasticsearch ID, a risk-score
ID, or a registry reference. It is present even for zero-result searches. The
server persists the exact normalized query, ordered result/evidence contract,
source statuses, partial flag, result count, and distinct methodology versions
before responding. Owner, filing date, and conceptual score retain `null`.
Elasticsearch relevance, raw Elasticsearch/source payloads, headers, cookies,
credentials, legal recommendations, and generated legal conclusions are never
stored or returned.

`GET /api/v1/search-results/:id` returns the exact stored historical snapshot
without rerunning search or recalculating risk. It is firm-scoped and available
to Admin, Attorney, and Viewer; a malformed ID is rejected safely and a missing
or cross-firm ID returns `404 SEARCH_RESULT_NOT_FOUND`.

`GET /api/v1/search-results` returns:

```json
{ "searchResults": [{ "id": "uuid", "requestedByUserId": "uuid", "requestId": "string", "query": {}, "resultCount": 1, "partial": false, "methodologyVersions": ["confusion-risk-v1.0.0-provisional"], "createdAt": "ISO-8601" }], "nextCursor": null }
```

It accepts optional `requestedByUserId`, `createdFrom`, `createdTo`, `partial`,
`pageSize`, and opaque `cursor`. `pageSize` defaults to 25 and is at most 100;
ordering is `createdAt DESC, id DESC`. Admin can list or filter firm history.
Attorney and Viewer requests are additionally constrained to their own search
history even when a requester filter is supplied. There are no snapshot update
or delete routes.

Retries with the same valid request ID reuse a snapshot only when the normalized
query and complete response are equivalent; differing content receives
`409 SEARCH_SNAPSHOT_CONFLICT`. Stable snapshot errors are
`SEARCH_SNAPSHOT_INVALID`, `SEARCH_SNAPSHOT_TOO_LARGE`,
`SEARCH_SNAPSHOT_PROVENANCE_INVALID`, `SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID`,
`SEARCH_SNAPSHOT_CONFLICT`, `SEARCH_SNAPSHOT_WRITE_FAILED`,
`SEARCH_RESULT_NOT_FOUND`, and `SEARCH_SNAPSHOT_CURSOR_INVALID`.

The persisted snapshot and one bounded `search.executed` audit event share a
single transaction. The audit record includes only the search ID, result count,
partial state, methodology versions, source-name groups, and normalized query
counts. BE-20 must use the internal
`loadSearchSnapshotForExport({ firmId, actorUserId, searchResultId })` boundary
and existing `ExportAuditService` lifecycle hook; it must not recalculate the
historical search or create a client-facing export-event endpoint. Migration
`011_create_search_results.sql` was not applied. Snapshot retention and any
authorized cleanup process remain operational/legal policy decisions.

## BE-20 PDF export contract

PDF export is disabled by default. When deployment explicitly enables it,
authenticated Admin and Attorney users may call:

| Method and path | Request / response | Access |
|---|---|---|
| `POST /api/v1/exports` | `{ "type": "search_results\|risk_report\|portfolio_summary", "sourceEntityId": "uuid", "parameters": {}, "idempotencyKey": "bounded-key" }`; `202` newly queued, `200` equivalent retry | Admin, Attorney |
| `GET /api/v1/exports` | `{ exports: [summary], nextCursor }`; optional `status`, `type`, bounded `pageSize`, opaque `cursor` | Admin, Attorney |
| `GET /api/v1/exports/:id` | Full safe lifecycle record | Admin, Attorney |
| `GET /api/v1/exports/:id/download` | `application/pdf` attachment only after completion | Admin, Attorney |

Viewer receives the standard `403 FORBIDDEN`. Firm and requester values are
never accepted from the request body. Every read/download is firm-scoped;
missing or cross-firm records are `404 EXPORT_NOT_FOUND`. Attorney lists are
limited to that attorney's own requests; Admin lists are firm-wide. Disabled
routes return the existing `404 NOT_FOUND` feature-gate behavior.

For `search_results`, `sourceEntityId` is a BE-19 persistent `searchId` and
parameters must be `{}`. For `risk_report`, it is the persisted `searchId` and
parameters must be exactly `{ "resultId": "stored-result-identifier" }`. For
`portfolio_summary`, it is a firm portfolio-mark UUID and optional boolean
`includeWatches`/`includeAlerts` parameters select only bounded current
summaries. The server never trusts a frontend `searchId` as a newly calculated
result, never reruns Elasticsearch/risk scoring, and never constructs legal
advice. Risk report evidence is the exact historical persisted Visual,
Phonetic, and Class evidence; partial searches visibly disclose unavailable
sources. Registry/Office Action provenance is retained, while null values are
shown as “Not available.”

A safe export record contains `id`, `type`, `status`, `sourceEntityId`,
`requestId`, safe `parameters`, `mimeType`, `byteSize`, `checksumSha256`, stable
`failureCode`, and lifecycle timestamps. List summaries omit parameter and
checksum detail. Neither response includes a storage key, filesystem path,
signed URL, token, PDF bytes, stack trace, raw result data, or infrastructure
error. Downloads are streamed from server-private storage and only when status
is `completed`.

Clients should retry a timed-out `POST` using the exact same idempotency key and
semantically identical request. A reused key with different type/source/
parameters or requester returns `409 EXPORT_IDEMPOTENCY_CONFLICT`. Other stable
errors include `EXPORT_REQUEST_INVALID`, `EXPORT_CURSOR_INVALID`,
`EXPORT_QUEUE_UNAVAILABLE`, `EXPORT_NOT_READY`,
`EXPORT_DOWNLOAD_UNAVAILABLE`, and `EXPORT_SOURCE_NOT_FOUND`. There are no
export update/delete routes and no client-facing audit-event route.

The export worker audits `export.requested`, `export.completed`, and
`export.failed` without raw PDF/source/storage data. PDFs are research
assistance—not legal advice or conclusions—and include a disclaimer, source
attribution, generation time, export ID, and page numbers. Migration
`012_create_exports.sql` was not applied. Redis, private storage permissions,
the worker process, migration application, and disposable staging verification
remain operational gates; BE-14 billing remains explicitly deferred.

## BE-21 API security boundary

BE-21 adds backend-only hardening without a frontend feature change. The API
rejects request targets longer than 4 KB with `414 REQUEST_TARGET_TOO_LARGE`
and JSON bodies over 16 KB with `413 REQUEST_BODY_TOO_LARGE`; clients should
not retry either unchanged request. Existing endpoint-level field, pagination,
cursor, metadata, and export limits still apply and may return their established
`400` validation codes.

Responses and audit records do not include Authorization headers, cookies,
tokens, raw request bodies, storage keys, filesystem paths, signed URLs, stack
traces, or infrastructure error details. A completed export download is
revalidated for PDF signature, recorded byte size, and SHA-256 integrity before
it is sent; a failed integrity check returns `503 EXPORT_DOWNLOAD_UNAVAILABLE`.

No firm selector is accepted by any API body or query: all current and future
calls must rely on the verified membership represented by the Bearer token.
Production origin/proxy/TLS deployment values and the private storage root are
operational configuration, not a frontend-controlled contract. The full
repository-local review and its BE-22 handoff are recorded in
`09-internal-security-review.md`; BE-14 remains explicitly deferred.

## BE-25 health and readiness contract

`GET /healthz` is public process liveness and returns `{ "status": "ok" }`.
`GET /readyz` is public, dependency-safe readiness and returns
`{ "status": "ready" }` only when the configured PostgreSQL and Redis checks
succeed; otherwise it returns `503 NOT_READY` without infrastructure names,
credentials, or stack details. These endpoints are operational probes, not a
client authorization/session substitute. The canonical machine-readable reference
is `backend/openapi.json` and is checked against the mounted route inventory.
