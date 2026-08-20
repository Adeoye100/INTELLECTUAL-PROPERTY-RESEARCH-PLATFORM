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
| `GET /api/v1/portfolio` | No body | `PortfolioMark[]` | Admin, Attorney, Viewer within firm | Pagination, filters/sort, field nullability, registry freshness |
| `POST /api/v1/portfolio` | `{ markText, jurisdiction, niceClasses: number[], renewalDate }` | `201 PortfolioMark` | Admin, Attorney | Required legal owner/source fields, duplicate policy, date rules, audit event |
| `GET /api/v1/portfolio/:markId` | Mark ID in path | `PortfolioMarkDetail` including `statusHistory[]` | Admin, Attorney, Viewer in same firm | Not-found vs cross-tenant non-disclosure, history pagination/provenance |
| `GET /api/v1/portfolio/:markId/attachments` | Mark ID in path | `PortfolioAttachment[]` | Admin, Attorney, Viewer in same firm | Storage metadata, malware state, pagination, retention |
| `GET /api/v1/portfolio/:markId/attachments/:attachmentId/download` | IDs in path | Current mock shape `{ downloadUrl, fileName, mocked? }` | Admin, Attorney, Viewer in same firm | Direct authenticated blob vs short-lived URL, content-type/disposition, URL TTL, download audit; current frontend fixture is not a live contract |
| `POST /api/v1/portfolio/:markId/watch` | `{ alertChannel: 'email' \| 'in-app', alertMode: 'real-time' \| 'digest', active: boolean }` | `200/201 WatchSummary` | Admin, Attorney | Duplicate behavior and whether this convenience route exists alongside `POST /watches` |
| `GET /api/v1/watches` | No body | `WatchSummary[]` | Admin, Attorney, Viewer within firm | Pagination, ownership scope, delivery health/status fields |
| `POST /api/v1/watches` | `WatchUpsertRequest` | `201 WatchSummary` | Admin, Attorney | Limits, scheduling transaction, duplicate policy, audit event |
| `PATCH /api/v1/watches/:watchId` | Current frontend sends full `WatchUpsertRequest` | `WatchSummary` | Admin, Attorney | PATCH partial-vs-full semantics, optimistic concurrency, ownership scope |
| `GET /api/v1/alerts` | Query: `read`, `severity`, `source`, `dateFrom`, `dateTo` | `Alert[]` | Admin, Attorney, Viewer within allowed watch scope | Pagination, cursor/order, date semantics/time zone, retention |
| `PATCH /api/v1/alerts/:alertId` | `{ read: boolean }` | `Alert` | Authenticated user allowed to view alert | Whether read state is per-user, concurrency, bulk-read endpoint |
| `GET /api/v1/office-actions/search` | Query: `markText`, `niceClass` | `OfficeActionRef[]` | Admin, Attorney, Viewer | Licensed source, pagination, citation fields, filters, result provenance |
| `POST /api/v1/office-actions/link` | `{ officeActionId, portfolioMarkId }` | `{ success, message, linkedOfficeActionId, linkedPortfolioMarkId }` | Admin, Attorney | Canonical resource model, duplicate/unlink behavior, audit event |
| `GET /api/v1/matters` | No body | `Matter[]` | Admin, Attorney, Viewer within firm | Entire route; frontend currently uses local storage instead of this mock handler |
| `POST /api/v1/matters` | Candidate `{ name, clientRef? }` | `201 Matter` | Admin, Attorney | Entire create contract, required client/firm data, audit event |
| `POST /api/v1/matters/:matterId/risk-results` | `MatterSaveRequest` risk snapshot | `MatterSaveResult` | Admin, Attorney | Snapshot authority, versioning, idempotency, whether browser-supplied scores are accepted (they should not be authoritative) |
| `POST /api/v1/reports/pdf` | `PdfReportRequest`: one of search-results context, risk-detail context, or portfolio-summary context | Required frontend target: direct non-empty `application/pdf` blob with `Content-Disposition` filename | Authenticated user authorized for every referenced firm/matter/search/result/mark; Viewer export permission unresolved | Route existence, accepted IDs, synchronous vs job model, filename encoding, size/time limits, error model |

Type definitions referenced above live in `frontend/src/types/index.ts`; PDF request variants live in `frontend/src/components/PdfExport.tsx`. These are frontend expectations, not an authoritative schema.

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
