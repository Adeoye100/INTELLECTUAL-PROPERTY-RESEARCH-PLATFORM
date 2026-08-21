# FE-21 Frontend API Contract Register

## Status and evidence

Originally inspected on 2026-08-05 when `backend/` contained only `package.json`.
BE-03/BE-04/BE-05 now add an Express auth implementation, raw PostgreSQL
migration, Redis-backed refresh sessions, RBAC middleware, and real-store
integration tests. This is repository implementation evidence only: no staging
deployment is claimed, and the auth response contract still needs reconciliation
with the frontend before FE-21 can call it live.

The paths below are the existing frontend/MSW contract candidates, consistently
rooted at the documented `/api/v1` base path. Unless an entry explicitly records
the BE-03/BE-04 implementation, the path is not evidence that a backend route
exists. MSW fixtures remain isolated-development aids and return mock data only.

## Transport contract required from the backend

- Live deployments must set `VITE_API_BASE_URL` to a root-relative value or an HTTP(S) URL ending in `/api/v1`; absolute non-development URLs must use HTTPS and protocol-relative URLs are rejected.
- `VITE_API_MODE` defaults to `live`. Only an explicit `VITE_API_MODE=mock` in a Vite development build starts MSW; non-development builds reject mock mode.
- Protected requests send `Authorization: Bearer <access-token>`, `Accept: application/json`, and JSON bodies with `Content-Type: application/json`.
- The client times out ordinary requests after 15 seconds and PDF generation after 30 seconds. The backend must make idempotency/retry guarantees explicit for mutations before automatic mutation retries are added.
- A `401` received while an access token is present clears the client session and navigates to sign-in. The refresh-token endpoint, rotation contract, cookie policy, and race handling are unresolved.
- Expected error shape is `{ code?: string, message?: string, details?: unknown, requestId?: string }`. The frontend normalizes 400/409/422, 401, 403, 404, 5xx, network, timeout, cancellation, invalid JSON, and invalid content types. The authoritative error-code catalog is unresolved.
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
| `GET /api/v1/search` | Query: `mark`, repeated `jurisdiction`, comma-separated `class`, `status`, `owner`, `filedFrom`, `filedTo`; `resultId` is rejected by the authenticated search boundary (snapshot retrieval remains BE-19) | `SearchResponse` with `results`, per-source statuses, `partial?`, `requestId?`; every result includes transient `riskAnalysis` with BE-10B component scores, `conceptualScore: null`, methodology, provenance, and Visual/Phonetic/Class evidence. `owner` and `filingDate` may be `null` when the registry has no value. Elasticsearch `relevanceScore`, persistent risk IDs, and legal conclusions are not exposed. | Admin, Attorney, Viewer; usage limits server-enforced | GET vs search-job POST, pagination, progressive polling/streaming, canonical result-detail route, source timeout semantics, query limits; frontend `SearchResult` currently types nullable fields and the new `riskAnalysis` contract differently and requires reconciliation before live integration |
| `POST /api/v1/portfolio/import` | `{ searchResultId: string }` | `201 PortfolioMark` | Admin, Attorney | Idempotency, source snapshot, ownership/firm selection, renewal derivation |
| `GET /api/v1/portfolio-marks` | Implemented canonical list; see BE-11 contract below | `200 { items, pagination }` | Admin, Attorney, Viewer within firm | Frontend must migrate old `/portfolio` mock calls before live use |
| `POST /api/v1/portfolio-marks` | Implemented canonical create; see BE-11 contract below | `201 PortfolioMark` | Admin, Attorney | BE-16 audit event required before production activation |
| `GET /api/v1/portfolio-marks/:id` | UUID path parameter | `200 PortfolioMark` | Admin, Attorney, Viewer in same firm | No status-history endpoint in BE-11 |
| `PATCH /api/v1/portfolio-marks/:id` | Non-empty mutable-field subset | `200 PortfolioMark` | Admin, Attorney | BE-16 audit event required before production activation |
| `DELETE /api/v1/portfolio-marks/:id` | UUID path parameter | `204` | Admin, Attorney | Transactional hard delete pending a documented retention policy |
| `GET /api/v1/portfolio/:markId/attachments` | Mark ID in path | `PortfolioAttachment[]` | Admin, Attorney, Viewer in same firm | Storage metadata, malware state, pagination, retention |
| `GET /api/v1/portfolio/:markId/attachments/:attachmentId/download` | IDs in path | Current mock shape `{ downloadUrl, fileName, mocked? }` | Admin, Attorney, Viewer in same firm | Direct authenticated blob vs short-lived URL, content-type/disposition, URL TTL, download audit; current frontend fixture is not a live contract |
| `POST /api/v1/portfolio/:markId/watch` | Not implemented; no convenience alias | — | — | Canonical BE-12 route is `/api/v1/watches` |
| `GET /api/v1/watches` | Implemented; see BE-12 contract below | `200 { items, pagination }` | Admin, Attorney, Viewer within firm | Frontend contract migration remains separate work |
| `POST /api/v1/watches` | Implemented; see BE-12 contract below | `201 Watch` | Admin, Attorney | BE-16 audit event required before production activation |
| `PATCH /api/v1/watches/:id` | Non-empty state/interval subset | `200 Watch` | Admin, Attorney | No alert policy is configured here |
| `GET /api/v1/watches/:id` | UUID path parameter | `200 Watch` | Admin, Attorney, Viewer within firm | Implemented BE-12 |
| `DELETE /api/v1/watches/:id` | UUID path parameter | `204` | Admin, Attorney | Transactional hard delete; BE-16 audit gate applies |
| `GET /api/v1/alerts` | Implemented canonical list; see BE-13 contract below | `200 { items, pagination }` | Admin, Attorney, Viewer within firm | No outbound delivery behavior in BE-13 |
| `GET /api/v1/alerts/:id` | UUID path parameter | `200 Alert` | Admin, Attorney, Viewer within firm | Implemented BE-13 |
| `PATCH /api/v1/alerts/:id` | `{ action: 'read' \| 'dismiss' }` | `200 Alert` | Admin, Attorney | Strict state transitions only |
| `GET /api/v1/office-actions/search` | Query: `markText`, `niceClass` | `OfficeActionRef[]` | Admin, Attorney, Viewer | Licensed source, pagination, citation fields, filters, result provenance |
| `POST /api/v1/office-actions/link` | `{ officeActionId, portfolioMarkId }` | `{ success, message, linkedOfficeActionId, linkedPortfolioMarkId }` | Admin, Attorney | Canonical resource model, duplicate/unlink behavior, audit event |
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
then descending ID. Supported filters are `status`, `jurisdiction`,
`sourceRegistry`, exact `registryReference`, `niceClass`, `renewalAfter`, and
`renewalBefore` (the date filters use `YYYY-MM-DD`).

Stable errors are `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN`
(403), `PORTFOLIO_MARK_NOT_FOUND` (404), `PORTFOLIO_MARK_CONFLICT` (409), and
`INTERNAL_ERROR` (500). The conflict is the same firm's duplicate
`sourceRegistry`/`registryReference`; SQL and tenant details are not exposed.

Deletion is a transactional hard delete because the schema specifies no
soft-delete or retention policy. BE-16 must add redacted audit entries for
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

The frontend only submits typed screen context, waits, validates `application/pdf`, derives a safe fallback filename or uses the server `Content-Disposition` filename, creates a temporary browser object URL, and exposes loading/failure/retry states. The backend owns authoritative data reconstruction, generation, storage, encryption, tenant/object authorization, retention/expiry, rate limiting, and immutable `export.generate` audit logging. Browser-supplied IDs or display values must never be treated as authorization or authoritative legal data.

## Verification gates before any live integration is declared

1. A backend application and versioned routes exist in this repository or an explicitly linked service repository.
2. An authoritative OpenAPI contract defines requests, responses, errors, authentication, role and tenant rules.
3. Backend route and authorization tests pass, including cross-tenant non-disclosure.
4. The frontend contract module is reconciled to that specification rather than to MSW fixtures.
5. Integration tests pass against seeded staging data, and the tested environment/version is recorded.
