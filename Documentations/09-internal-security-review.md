# BE-21 internal security review

## Review record

- **Review date:** 2026-08-22
- **Starting commit:** `adfcda34164c4838fa354c57b7878a8300eebbe1` (BE-20)
- **Scope:** repository-local backend review of BE-03 through BE-20, including
  `backend/src`, unit tests, migrations `001`–`012`, package/lock files,
  configuration, scripts, backend documentation, and API/exit-check documents.
- **Explicit exclusions:** BE-14 billing, BE-22, frontend changes, migration
  application, live/staging services, external registries/Elasticsearch,
  destructive testing, credential rotation/revocation, commits, and pushes.
- **Starting test baseline:** the unit suite required local loopback binding and
  therefore could not run in the restricted sandbox (`EPERM`); the approved
  local-only run passed **254 tests / 64 suites / 0 failures**. No external
  request was made.

## Methodology

The review first read the in-scope code and documents without modifying the
tree, then traced every mounted route from `createApp()` through validation,
authentication, role checks, service, repository, and queue/storage boundaries.
It inspected migrations lexically without applying them; reviewed SQL for
parameterization and tenant predicates; reviewed parsers for bounds and unsafe
objects; and used injected fakes/local application requests for regressions.

Repository-local checks included syntax checking, unit tests, lockfile/package
inspection, a tracked-file secret-pattern scan that reported filenames/categories
only, and an offline dependency-audit attempt. `pnpm audit --offline`
nevertheless attempted its advisory endpoint; name resolution failed before an
advisory response and the command was stopped. No secret value, token, cookie,
or working exploit payload is included in this report.

## Attack-surface and trust-boundary inventory

| Surface | Review result |
|---|---|
| Public health/system endpoints | No unauthenticated health or system HTTP endpoint is mounted. The public invitation details/acceptance endpoints are rate limited. Final unmatched routes return a safe 404. |
| Authentication and Supabase verification | Protected routes run `authenticate` before `requireRole`. Strict Bearer parsing leads to JWKS asymmetric verification (ES256/RS256 allowlist, issuer, audience, expiry) or configured Supabase `/user` verification. |
| RBAC/membership | Server resolves firm membership; role and firm come from `request.auth`, never body/query. Admin-only audit and role change routes, write restrictions for Viewer, and firm-concealed 404s were traced and tested. |
| Portfolio, watch, alert, user, audit | Route validators and parameterized repositories use firm-scoped operations; nested Office Action references validate both mark and child scope. |
| Search and Office Actions | Feature-gated authenticated routes have bounded parsers; search snapshots are immutable and history rules are role-scoped. Office Action adapters preserve attributed source data. |
| Elasticsearch and registry adapters | Config/runtime restrict URLs, indexes, registries, timeouts, results, and error disclosure. BE-21 tightened remote URL and discovered archive-link controls. |
| Redis queues/workers | Watch and PDF jobs are versioned minimal records, UUID validated, size-bounded before JSON parsing, deduplicated, lock-protected, and revalidated against persisted firm ownership before mutation. |
| Search persistence/PDF exports | Search snapshots and audit data are bounded/immutable. Exports are firm-scoped, private-key only, checksum-backed, and download authorization is server-side. |
| PostgreSQL/migrations | Repositories parameterize values; migrations 001–012 order dependencies lexically, contain composite tenant keys where required, and use append-only triggers for audit/search snapshot tables. They remain unapplied. |
| Parsing/errors/config/logging | JSON/request target, cursors, pagination, metadata, export/queue data, request IDs, and audit snapshots are bounded. Error serialization is stable and excludes internal details. |

| Trust boundary | Security responsibility reviewed |
|---|---|
| Client → API | Strict headers/parsers, request bounds, authentication before authorization, route RBAC, firm derivation, safe errors/CORS. |
| API → Supabase | Asymmetric verified claims or server-side `/user`; no token/claim logging; local membership resolution. |
| API → PostgreSQL | Parameterized SQL, transaction-coupled sensitive mutation/audit writes, tenant predicates, verified TLS. |
| API → Redis | HMAC rate-limit identity keys; atomic scripts; validated, bounded queue payloads and locks. |
| API → Elasticsearch | Configured credential-free URL and allowlisted index only; no client-selected destination. |
| Worker → private storage | Server-generated firm/export key, private root assumption, PDF signature/size/checksum checks, no key/URL in API response. |
| Registry adapters → external sources | Configured registry allowlists, same-origin bulk archives, abortable timeout and no redirects; no user-controlled target. |

## Route security matrix

The executable central matrix is
`backend/test/unit/phase2-route-inventory.test.js`; it mounts every current
non-deferred route and asserts authentication, permitted roles, mutation
restrictions, firm override rejection, and cross-firm concealment. Its reviewed
coverage is summarized below.

| Route group | Authentication / permitted roles | Tenant or ownership boundary |
|---|---|---|
| `/auth/invitations/:token` and acceptance | Public, rate-limited recovery flow | Signed bounded invitation only; no firm selection from client |
| `/provisioning/firm` | Verified identity, registration rate limit | Server derives linked identity |
| `/me`, role/firm pings | Authenticated; dedicated role pings | Membership-derived firm |
| Admin invitations, audit logs, user role change | Authenticated Admin | Firm-scoped admin target; concurrent last-Admin transaction guard |
| `/search`, `/search-results` | Authenticated Admin/Attorney/Viewer | Snapshot retrieval/listing firm-scoped; Attorney/Viewer history constrained |
| `/portfolio-marks`, `/watches`, `/alerts` | Reads all roles; mutations Admin/Attorney | Firm-derived CRUD and concealed 404s |
| Office Action search/references | Search reads all roles; reference writes Admin/Attorney | Nested mark and reference both firm-scoped |
| `/exports` and download | Authenticated Admin/Attorney | Firm-scoped record/download; Attorney list restricted to requester |

## Findings

| ID | Severity | Component | Description / exploit precondition / impact | Evidence | Remediation | Status | Verification evidence |
|---|---|---|---|---|---|---|---|
| ISR-001 | Medium | PostgreSQL transport | SSL mode disabled certificate verification. A network position able to present a trusted-looking endpoint could intercept database traffic. | `backend/src/db/pool.js` prior SSL options; README prior wording | Require certificate verification whenever `DATABASE_SSL=true`. | **Fixed** | Pool option regression/syntax suite; deployment CA validation remains a gate. |
| ISR-002 | Medium | HTTP parser | The default JSON limit was broader than the documented bounded API posture and oversized parse errors became generic safe errors; request targets had no early cap. A client could consume excess parser work. | `backend/src/app.js`, `backend/src/errors.js` | Add 4 KB target / 16 KB JSON limits, early middleware, stable 414/413 codes. | **Fixed** | `security-hardening.test.js` rejects both before route work. |
| ISR-003 | Medium | Export download/storage | A completed record trusted a private-storage object after status check without rechecking PDF magic bytes, recorded size, or checksum. Precondition: private storage object is altered or corrupted. Impact: wrong/tampered bytes could be served. | `backend/src/exports/export-service.js`, `export-storage.js` | Validate PDF signature on storage, and signature/size/SHA-256 before download. | **Fixed** | `pdf-exports.test.js` corrupt-object regression returns `EXPORT_DOWNLOAD_UNAVAILABLE`. |
| ISR-004 | Medium | Watch/PDF Redis queues | A Redis list element was parsed before an explicit payload-size cap. Precondition: queue write access or corrupted queue data. Impact: avoidable memory/CPU pressure. | `watch-ingest-queue.js`, `pdf-export-queue.js` | Cap raw serialized jobs at 1 KB before `JSON.parse`; bound queue TTL constructor inputs. | **Fixed** | Watch/PDF poisoned oversized-job regressions. |
| ISR-005 | Medium | Elasticsearch/USPTO outbound network | Remote HTTP Elasticsearch URLs and an arbitrary configured USPTO listing/discovered cross-origin archive link could expand the outbound trust boundary. Precondition: unsafe deployment configuration or compromised listing. Impact: SSRF-like unintended destination. | `config.js`, `elasticsearch-projector.js`, `bulk-xml-adapter.js` | Require credential-free HTTPS except loopback development; allowlist index syntax; disable redirects, add timeout, and restrict archives to listing origin. | **Fixed** | Config rejects remote HTTP; adapter test refuses cross-origin archive. |
| ISR-006 | Low | Audit logging | Recursive redaction recognized only exact sensitive names, not sensitive key fragments. Precondition: a developer adds an audit field such as a compound cookie/token/secret name. Impact: accidental sensitive logging. | `audit-sanitizer.js` | Case-insensitive fragment redaction while retaining pollution-key stripping and bounded cloning. | **Fixed** | Nested compound-key redaction regression in `security-hardening.test.js`. |
| ISR-007 | Low | API HTTP hardening | API responses lacked an explicit restrictive security-header baseline. Precondition: browser/client interaction with an endpoint. Impact: reduced defense in depth. | `backend/src/app.js` | Add CSP, anti-framing, no-sniff, referrer, COOP/CORP, and DNS-prefetch headers; retain explicit CORS behavior. | **Fixed** | Header assertions in `security-hardening.test.js`. |
| ISR-008 | Low | Watch worker reliability | Retryable processing results were returned but not re-enqueued; retry count also permitted an extra attempt. Precondition: transient Redis/database/search failure. Impact: a scheduled poll could wait for its normal interval rather than bounded retry. | `watch-worker.js`, `watch-ingest-processor.js`, `watch-ingest-queue.js` | Requeue verified retryable jobs with deterministic fresh ID, exponential second-scale backoff, and three-attempt limit. | **Fixed** | `watch-service.test.js` asserts bounded retry payload/ID/backoff. |
| ISR-009 | Low | Supabase session/revocation | JWT validation is cryptographic and membership is refreshed from server storage, but this architecture has no per-request Supabase revocation/session-introspection check. Cached local membership can persist for its bounded TTL. Precondition: a previously valid token/session is revoked upstream. Impact: access can remain until token expiry/cache refresh under the documented model. | `auth/supabase-verifier.js`, `auth/supabase-authenticate.js`, membership resolver/cache | Keep current Supabase-owned session model; decide whether stronger revocation latency is required. | **Accepted** | Existing verifier/membership tests; requires product/security decision and staging validation. |
| ISR-010 | Medium | Deployment/private filesystem storage | Key validation prevents traversal, but filesystem storage relies on an access-controlled private root; source review cannot prove production ownership, permissions, mount behavior, or symlink resistance under a compromised local principal. | `export-storage.js`, `config.js` | Keep private-storage assumption; verify root ownership/mode, no untrusted writers, and symlink policy in staging/production. | **Operational gate** | No live filesystem was accessed by this ticket. |
| ISR-011 | Medium | Registry response handling | Requests have timeout/redirect/origin controls, but response/decompression byte ceilings depend on upstream fetch/runtime behavior rather than an explicit streaming cap. Precondition: compromised/oversized permitted upstream response. Impact: memory/resource pressure. | `bulk-xml-adapter.js`, ingestion parsers | Independent review should assess/add streaming response limits compatible with supported source formats. | **Open** | No live registry call permitted; retain as BE-22 blocker for external adapter assurance. |
| ISR-012 | Informational | Dependency advisories | Installed lockfile was inspected, but no current advisory database was available locally. Precondition: an undisclosed upstream advisory. Impact: unknown dependency risk, not a claim of safety. | `backend/package.json`, `pnpm-lock.yaml` | Run approved current advisory scan in CI/secure environment. | **Operational gate** | Offline audit attempt produced no usable advisory result. |
| ISR-013 | Low | Export list parser | Express supplies a null-prototype query map, but export-list parsing accepted only `Object.prototype`; a normal authenticated `GET /exports` therefore returned 400. Precondition: any valid list request. Impact: authorized export history unavailable, with no tenant bypass. | `exports/export-validation.js`, central route matrix failure | Accept null-prototype query maps only at this allowlisted parser boundary; rebuild only validated output. | **Fixed** | `phase2-route-inventory.test.js` now mounts and serves `GET /exports`. |

No Critical or High finding was identified. ISR-011 remains visibly Open and
must be assessed before external-source sign-off; it does not claim a remotely
verified vulnerability.

## Authentication, RBAC, and tenant-isolation conclusion

Authentication precedes authorization on mounted protected routes. Bearer
headers are strict; unsigned/symmetric confusion is rejected in JWKS mode;
configured issuer/audience/expiry verification is covered by tests; and
verification failures produce stable 401 responses without raw verifier details.
Tokens, cookies, and claims are not logged. Membership, firm, and role are
resolved server-side. Viewer mutation denial, Admin-only role/audit access,
firm-concealed not-found behavior, nested Office Action ownership, and
cross-firm export download denial have regression coverage.

Role changes hold active Admin rows in a transaction before allowing a last
Admin change. Database-level concurrency behavior requires a real PostgreSQL
staging check. Supabase owns refresh/session behavior; this backend neither
implements nor claims local password, refresh, logout, or immediate remote
revocation semantics.

## Input, queue, export, audit, and migration conclusion

Review found parameterized SQL values and fixed query-shape identifiers rather
than user-controlled dynamic SQL. Parsers reject pollution keys, unsafe object
shapes, circular/unserializable audit/export data, oversized cursors/snapshots,
bad pagination, dates, fields, Office Action metadata, and export parameters.
No unbounded regular expression or client-selected network destination was
identified. Queue jobs contain no record bodies/secrets and are revalidated
against persisted firm/parent ownership before processing mutations.

Migrations `001`–`012` are lexically ordered and were not changed or applied.
The review found additive historical design, tenant-aware composite references
where resource ownership requires them, audit/search append-only triggers, and
export lifecycle constraints. A live database still must prove migration
checksum/order, trigger enforcement, indexes under load, and role-change race
behavior. No schema correction was safe or required from repository evidence,
so no new migration was added.

## Fixes applied

1. Enforced verified database TLS.
2. Added bounded HTTP request target/JSON parsing, safe 413 handling, and
   restrictive response headers.
3. Bounded audit cursors and made recursive secret redaction more robust.
4. Bounded raw queue payloads and queue TTL configuration.
5. Added bounded retry/backoff to the watch worker.
6. Restricted Elasticsearch and USPTO outbound destinations, redirects, and
   timeout behavior.
7. Rechecked private export bytes before download.
8. Extended the central executable route/RBAC/tenant matrix to Office Action,
   search history, and export routes.
9. Corrected export-list handling for Express's safe null-prototype query map
   without relaxing field allowlists or object validation for request bodies.

## Accepted residual risks

- ISR-009: session revocation latency follows the existing Supabase/JWT and
  bounded membership-cache architecture. This is accepted design scope, not an
  assertion of immediate revocation.
- HTTP security headers are application-level defense in depth. TLS, HSTS,
  request filtering, and production origin policy must be enforced by the
  deployment edge as appropriate.
- Private filesystem storage is intentionally private-by-deployment design; its
  physical/OS controls cannot be proven from source.

## Deferred operational checks

- Apply and verify migrations `006`–`012` only in disposable staging; do not
  alter historical migration files.
- Verify database CA chain, Redis authentication/ACL/network isolation, worker
  process permissions, private storage root mode/owner/no-symlink policy,
  backup/retention, and cleanup behavior.
- Configure and prove explicit production CORS origins and proxy-hop trust;
  production must not rely on the local Vite origin.
- Run controlled staging authentication, role, firm-isolation, rate-limit,
  queue, registry, Elasticsearch, and export checks using dedicated test
  accounts and no production data.
- Obtain current dependency advisory and static-analysis results through an
  approved local/CI channel. No claim that dependencies are vulnerability-free
  is made here.

## BE-22 handoff checklist

- Independently review ISR-011 and add/validate response/decompression limits
  for each permitted registry adapter.
- Independently validate production/staging TLS certificates, ingress headers,
  CORS origins, trusted proxy topology, Supabase issuer/audience configuration,
  and revocation-latency decision.
- Execute non-destructive disposable-staging migration and authorization/race
  checks, including last-Admin concurrency and append-only trigger enforcement.
- Validate Redis ACLs/atomic scripts, duplicate/replay/poison-job behavior,
  queue monitoring, retry alerting, and worker least privilege.
- Validate private storage permissions, symlink/TOCTOU behavior, cleanup,
  retention, and corrupted-object download failure behavior.
- Obtain current dependency advisory data and independent static analysis; do
  not upload source/diffs to unapproved services.
- Confirm no secret values are committed and retain only filename/category
  evidence from future scans.
- Leave BE-14 explicitly deferred unless separately authorized; do not mark
  BE-22 or penetration testing complete based on this document.

## Honest completion status

**BE-21 code and repository-local review are complete, with regression tests
passing.** This is not production security sign-off: ISR-011 is Open, ISR-010
and ISR-012 require operational evidence, all existing staging gates remain
pending, BE-14 remains deferred, and BE-22 has not begun or been completed.
