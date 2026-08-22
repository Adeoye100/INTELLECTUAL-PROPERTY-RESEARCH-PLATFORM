# IPRP backend foundation

This service implements the `/api/v1` authentication foundation on the locked
Node.js + Express, PostgreSQL, and Redis stack. It intentionally does not contain
business APIs or password-reset/email-verification logic. BE-16 adds the
server-side audit boundary described below.

It also contains the BE-07/BE-08 USPTO registry adapters and the explicitly
Postgres-first trademark ingestion/projection commands described below.

## BE-10A similarity primitives

`backend/src/risk/similarity.js` contains pure, deterministic signals for later
risk methodology work. Mark normalization applies Unicode NFD decomposition,
removes combining marks, uppercases, replaces punctuation and symbols with
spaces, collapses whitespace, trims, and rejects empty or over-200-character
results. Visual similarity is `1 - Levenshtein distance / maximum normalized
length`, rounded to the nearest integer with `Math.round` and bounded to 0–100.

Phonetic similarity uses documented Standard American Soundex groups
(`BFPV=1`, `CGJKQSXZ=2`, `DT=3`, `L=4`, `MN=5`, `R=6`); vowels reset adjacent
codes while H/W preserve adjacency. Multiword marks are tokenized, Soundex
codes are matched order-independently as a multiset, and the score is matched
tokens divided by the larger token count, rounded with `Math.round`. Soundex is
an initial phonetic signal; a later methodology version may replace it with
Double Metaphone after evidence-based evaluation. Nice-class overlap is the
deduplicated intersection divided by the deduplicated union, multiplied by 100
and rounded with `Math.round`.

These primitives support the BE-10B composite methodology below and are not
themselves legal conclusions.

## BE-10B provisional confusion-risk methodology

`backend/src/risk/confusion-risk.js` provides the pure, infrastructure-free
`confusion-risk-v1.0.0-provisional` methodology. It is a transparent research
signal, not a legal determination. Its frozen component weights are visual
similarity **0.4**, phonetic similarity **0.4**, and Nice-class overlap **0.2**.
The composite is calculated as `visual × 0.4 + phonetic × 0.4 + class-overlap ×
0.2`, then rounded once with `Math.round` after the complete weighted total.

Ratings are deterministic: **Low** is 0–49, **Medium** is 50–74, and **High**
is 75–100. Conceptual scoring is unsupported and is always returned as `null`;
it does not contribute to the composite.

Every score includes ordered supporting evidence for Visual, Phonetic, and
Class signals. Each entry contains a label, explanatory text, and its numeric
0–100 score. Class evidence lists sorted intersecting Nice classes, or states
explicitly that no overlap exists. The result also preserves the candidate's
registry name and genuine external registry reference; it never substitutes an
internal record ID or treats Elasticsearch relevance as risk evidence.

These are provisional engineering defaults pending expert calibration and
staging evidence. Any change to the weights or thresholds requires a new
methodology version; they must never change silently under the same version.

## BE-10C/D risk-enriched search integration

`backend/src/risk/risk-enriched-search-service.js` is a pure decorator over a
federated search service. It passes the submitted query to that service once,
then enriches every returned candidate with the complete BE-10B methodology,
component scores, provenance, and Visual/Phonetic/Class evidence. A candidate
is never returned with a risk rating unless its complete evidence is present.

The decorator ranks enriched results by composite rating (**High**, then
**Medium**, then **Low**), composite score descending, Elasticsearch relevance
descending (with `null` last), source registry code-point order, and source
reference code-point order. Elasticsearch relevance is retained only as an
internal search-ranking tie-breaker; it neither supplies nor changes a legal-
risk signal.

Source statuses, `partial`, and `requestId` are passed through unchanged, and
their result counts continue to describe source responses rather than the
post-enrichment ranking. Invalid candidate/scoring data fails closed with the
safe `RISK_ENRICHMENT_FAILED` code; it is not recast as a registry outage and
no query, mark, registry reference, token, or complete error is logged.

When `SEARCH_ENABLED=true`, the runtime wraps `FederatedSearchService` with this
decorator and exposes the enriched service to the authenticated search route.
The API returns `riskAnalysis` evidence—not `riskScore`—for every candidate,
while omitting Elasticsearch `relevanceScore` and any legal conclusion. BE-19
adds one immutable persisted `searchId` to the search response and every result;
that ID is not an Elasticsearch or registry identifier. The decorator and API
projection make no construction-time network calls.

Before BE-10 can be treated as operationally ready, complete these gates:

1. Rebuild or fully reproject Elasticsearch documents so they contain genuine `source_reference_id` values.
2. Run authenticated staging searches with attributed registry data.
3. Test a controlled registry failure and verify source statuses/partial responses remain accurate.
4. Reconcile frontend nullable fields and the new transient `riskAnalysis` contract before live frontend integration.
5. Obtain domain/legal review before removing the methodology's provisional label or changing its versioned defaults.

## Federated search core (BE-09A)

`FederatedSearchService` is an infrastructure-independent orchestration core;
it does not add an HTTP route or call Elasticsearch or external registries. Give
it one or more sources shaped as `{ sourceName: 'USPTO', search: async (query) => [] }`.
Its `search(query, { requestId? })` runs every source concurrently and returns
`{ results, sourceStatuses, partial, requestId }`. Source failures and invalid
non-array outputs are isolated as `unavailable`, while healthy source results
and their registry attribution are returned in configured-source order. Risk
analysis is deliberately calculated only by the BE-10 decorator around this
service, never by the federated orchestration core itself.

## Local services and configuration

The documented local assumption is Docker Compose with PostgreSQL 16, Redis 7,
and Elasticsearch 9.4.2:

```sh
docker compose up -d
# Populate .env with the documented local service URLs and secrets, then:
set -a; . ./.env; set +a
pnpm migrate
pnpm indices:elasticsearch
pnpm test
pnpm start
```

For API development, `pnpm dev` from the repository root delegates to the
backend, and `pnpm dev` from `backend/` loads `backend/.env` through Node's
`--env-file` support before starting the watcher. Keep production configuration
in the deployment secret manager; `pnpm start` intentionally expects its
environment to be supplied by that runtime.

The Compose initialization creates both `iprp` and disposable `iprp_test`
databases. Integration tests require `TEST_DATABASE_URL`, `TEST_REDIS_URL`, and
`TEST_ELASTICSEARCH_URL` and fail instead of silently substituting in-memory
stores. Use only disposable test stores; Redis database 15 is selected in
`.env.example` to isolate test sessions.

The compose Elasticsearch node is deliberately local-development-only. It runs
as a single node with security disabled and port `9200` exposed. This is not a
production security posture: any deployed cluster must enable authentication,
TLS, authorization, backups, and appropriate node topology.

### Feature-gated search activation

The API search route is disabled by default. Its runtime settings are:

```dotenv
SEARCH_ENABLED=false
ELASTICSEARCH_URL=http://127.0.0.1:9200
SEARCH_SOURCE_REGISTRIES=USPTO
SEARCH_SOURCE_TIMEOUT_MS=3000
SEARCH_MAX_RESULTS=50
```

`SEARCH_SOURCE_REGISTRIES` is a comma-separated allow-list of registries that
are genuinely projected into `trademarks_composite`; it is not derived from
frontend filters. Registry names are trimmed, uppercased, and deduplicated.
When `SEARCH_ENABLED=false`, Elasticsearch settings are not required and
`GET /api/v1/search` returns 404.

Activate only after all of the following:

1. Confirm PostgreSQL contains attributed registry records.
2. Rebuild or fully reproject the development/staging composite index so every document contains `source_reference_id`.
3. Verify the configured registries genuinely exist in the index.
4. Set:

   ```dotenv
   SEARCH_ENABLED=true
   ```

5. Restart the API.
6. Test with a real Supabase user.
7. Confirm correct-role access succeeds.
8. Confirm invalid authentication returns 401.
9. Confirm one failed registry produces a partial response.
10. Keep production disabled until staging verification passes.

All required environment variables and token lifetimes are documented in
`.env.example`. `JWT_ACCESS_SECRET` currently signs application invitation
tokens and must be at least 32 bytes. Firm invitations default to seven days and
can be configured with `INVITE_TOKEN_TTL_SECONDS`.

## Migrations

Migrations are ordered raw SQL files under `migrations/`. `pnpm migrate` runs each
file once, records its SHA-256 checksum in `schema_migrations`, rejects changes to
an already-applied file, and serializes concurrent runners with a PostgreSQL
advisory lock. This deliberately avoids committing the project to an ORM before
the broader data-access architecture is selected.

From `backend/`, apply the schema to any fresh development or production database
by passing that database's connection string explicitly:

```sh
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE' pnpm migrate
```

The migration command needs PostgreSQL only; Redis and JWT configuration are not
required. It is safe to run during deployment because already-applied migration
checksums are verified and skipped. Never place a production connection string in
source control or shell history; inject `DATABASE_URL` through the deployment
secret manager.

To run migrations against Supabase or other hosted providers requiring SSL:

```sh
DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres' \
DATABASE_SSL=true \
pnpm migrate
```

## Supabase Postgres connection

Supabase provides two primary connection methods:

1.  **Direct Connection (Port 5432)**: Use this for migrations and maintenance. The host follows the pattern `db.[REF].supabase.co`.
2.  **Pooled Connection (Port 6543)**: Use this for the running application to handle connection pooling efficiently in serverless or highly concurrent environments. The host follows the pattern `[REF].pooler.supabase.com` (or similar depending on your region).

Both methods require SSL. In the IPRP backend, this is enabled by setting `DATABASE_SSL=true` in the environment. The `pg` driver is configured to accept Supabase's certificate (using `rejectUnauthorized: false` for compatibility across various Node.js environments).

## USPTO ingestion and Elasticsearch projection

The ingestion boundary is deliberately two commands:

```sh
# Inclusive UTC day. Reprocessing a day is safe because PostgreSQL uses an
# attributed (source_registry, source_reference_id) UPSERT key.
pnpm ingest:uspto -- --since 2026-01-05

# Create the exact composite and office-action mappings. Re-running is safe.
pnpm indices:elasticsearch

# Run separately after Postgres ingestion.
pnpm sync:elasticsearch
```

`ingest:uspto` reads the daily `apcYYMMDD.zip` links from
`USPTO_BULK_LISTING_URL`, streams each ZIP/XML file, and writes normalized rows
to `registry_trademarks`. Every row carries `source_registry = 'USPTO'` and the
USPTO serial number as `source_reference_id`. Unchanged replays do not update the
row or create projection work.

The Elasticsearch projector is the only component that writes to the
`trademarks_composite` index. New projections contain both `source_registry` and
the real registry `source_reference_id`; PostgreSQL remains the attributed source
of truth. Existing Elasticsearch documents do not gain this field automatically.
Before enabling the BE-09 search endpoint, the development/staging composite
index must be rebuilt or fully reprojected from PostgreSQL. Production index
deletion/recreation must not be automated casually. `sync:elasticsearch` selects
new/changed Postgres rows, submits them through that projector, and marks the
exact projected row version only after the bulk request succeeds. The registry
adapter never receives an Elasticsearch client.

These are manual commands for now. No `node-cron` scheduler was placed in the API
process, and no Redis queue library was introduced merely for this ticket. The
deployment scheduler or the later Redis-backed worker can invoke the same two
commands in order without changing the ingestion services.

## Elasticsearch indices

The custom local image installs Elastic's official `analysis-phonetic` plugin at
the same pinned version as Elasticsearch. `trademarks_composite.mark_text` uses
the standard analyzer for ordinary text matching and a `phonetic` multi-field
using Double Metaphone for sound-alike spellings. Double Metaphone was selected
over basic Soundex because it handles more spelling and pronunciation variation;
the filter uses `replace: true` so the dedicated sub-field contains phonetic
tokens without stacked original tokens. The Elasticsearch integration test proves
the setup by indexing `Kwik` and retrieving it with a `Quick` phonetic query.

`similarity_vector` is declared as a 384-dimension `dense_vector` with
`index: false`. This reserves the shape for the lightweight multilingual E5-small
embedding approach anticipated for cross-jurisdiction marks without paying kNN
indexing cost while the field is empty. Selecting or populating the embedding
model remains deferred as required; changing the model dimensionality later will
require a versioned index and reindex.

The `indices:elasticsearch` command sends idempotent HEAD/PUT requests for both
`trademarks_composite` and `office_actions`. Existing indices are left untouched;
creation races that return `resource_already_exists_exception` are also treated
as success. `projectToElasticsearch(record)` is the typed, single-record adapter
over the existing bulk projector and accepts the snake_case row shape returned by
PostgreSQL. BE-07/08 can continue using the current batch sync without a second
projection implementation.

The TSDR adapter implements only per-serial `getStatus`. It reads
`USPTO_TSDR_API_KEY` at construction and raises a specific configuration error at
call time when the key is missing. Its `fetchUpdates` and the bulk adapter's
`getStatus` intentionally raise `NotSupportedError`.

The verified real XML structure and sample provenance are recorded in
`Documentations/09-uspto-bulk-xml-reference.md`.

## Firm creation and invite-only joining

After Supabase creates the identity, self-serve signup sends `firmName` to the
bearer-protected provisioning endpoint. It trims leading/trailing whitespace,
collapses every run of internal whitespace to one space, and lower-cases the
result. The repository then compares it with the same normalized PostgreSQL
expression. A unique expression index and transaction-scoped advisory lock make
the check race-safe.

Self-serve provisioning can only create a new firm, whose first user is `admin`.
The local user is linked to the verified Supabase `sub` in the same transaction
and no password is sent to or stored by this API. If the normalized name already
exists, provisioning returns `409 FIRM_ALREADY_EXISTS` with a message directing
the user to request an invitation. A name match never grants a role or tenant
membership. Repeating the request for an already-provisioned Supabase identity
returns that identity's existing membership without creating another firm. If a
same-email local membership was already created through a valid invitation, the
endpoint links and returns that membership instead of attempting firm creation.

Joining an existing firm requires an Admin-issued invitation. The signed JWT binds
the invitation ID, firm ID, normalized email, intended role, and expiry. The
database stores the authoritative invitation row. Acceptance locks that row,
checks the signed claims against it, creates the user with the stored role, and
marks the invitation used in one transaction. Expired and already-used invitations
return `410 EXPIRED_LINK`; invalid or altered tokens return `403`.

### Authentication

The foundational auth API uses Supabase for identity and a local PostgreSQL/Redis
stack for firm membership and RBAC.

| Method and path | Body | Result |
|---|---|---|
| `POST /api/v1/provisioning/firm` | `{ firmName }` plus verified Supabase Bearer token | `201` linked Admin user and firm info |
| `GET /api/v1/me` | Verified Supabase Bearer token | `200` `{ userId, email, role, firmId }` |
| `POST /api/v1/admin/invitations` | `{ fullName, email, role }` plus Bearer token | `201` signed invitation token and info |
| `GET /api/v1/auth/invitations/:token` | None | `200` invitation details |
| `POST /api/v1/auth/invitations/:token/accept` | `{ fullName }` | `201` user/firm provisioning info |

Identity is verified on every request using the Supabase JWT. Local routes
provision the firm/user link. Supabase is the only password and session authority;
legacy local signup/login/refresh/logout behavior is retired.

## Local browser CORS

The API allows the local Vite origin `http://localhost:5173` only. Its preflight
response permits `Authorization` and `Content-Type` request headers and the
`OPTIONS` method. Other origins receive no CORS grant. Browser authentication
uses the Supabase access token in the Authorization header; cross-origin cookies
are not enabled.

## Portfolio Marks API (BE-11)

`/api/v1/portfolio-marks` is the canonical Portfolio Marks API. The older
`/api/v1/portfolio` paths listed in early frontend planning are not implemented
and must not be used as an alternate write path.

Every request requires a verified Supabase Bearer token and a resolved local
firm membership. The server derives `firmId` only from that membership; request
bodies and queries cannot select a firm. All record reads, changes, and deletes
are constrained by that firm, and a missing or another firm's ID returns the
same `404 PORTFOLIO_MARK_NOT_FOUND` response.

| Method and path | Roles | Result |
|---|---|---|
| `POST /api/v1/portfolio-marks` | Admin, Attorney | `201` PortfolioMark |
| `GET /api/v1/portfolio-marks` | Admin, Attorney, Viewer | `200` paginated portfolio marks |
| `GET /api/v1/portfolio-marks/:id` | Admin, Attorney, Viewer | `200` PortfolioMark |
| `PATCH /api/v1/portfolio-marks/:id` | Admin, Attorney | `200` PortfolioMark |
| `DELETE /api/v1/portfolio-marks/:id` | Admin, Attorney | `204` |

Create requires this JSON object (the three date fields may be omitted or be
`null`):

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

`PATCH` accepts a non-empty subset of the same mutable fields. It rejects
unknown fields and immutable/server-managed values including `id`, `firmId`,
`firm_id`, `ownerUserId`, `owner_user_id`, `createdAt`, and timestamps. Mark
text is at most 200 characters; jurisdiction is an up-to-8-character ISO
country/region code; source registry and registry reference are at most 100 and
200 characters respectively; Nice classes are unique integers 1–45; and status
is one of `pending`, `filed`, `registered`, `abandoned`, `expired`, or
`cancelled`. The registry reference must be a real registry registration or
application reference supplied by the caller; the API never invents one.

A `PortfolioMark` response is:

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

The list response is `{ "items": [PortfolioMark], "pagination": { "page":
1, "pageSize": 25, "total": 1, "totalPages": 1 } }`. Supported filters are
`status`, `jurisdiction`, `sourceRegistry`, exact `registryReference`,
`niceClass`, `renewalAfter`, and `renewalBefore`; dates use `YYYY-MM-DD`.
`page` defaults to 1 and is capped at 100,000; `pageSize` defaults to 25 and is
capped at 100. Results are always `created_at DESC, id DESC`, so pagination has
deterministic ordering.

Stable errors use `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN`
(403), `PORTFOLIO_MARK_NOT_FOUND` (404), `PORTFOLIO_MARK_CONFLICT` (409 for a
duplicate firm/source-registry/registry-reference), and `INTERNAL_ERROR` (500).
Responses never expose database errors or tenant-existence details.

The schema migration is `006_create_portfolio_marks.sql`; do not run it
automatically. Apply it only to the intended database with:

```sh
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE' pnpm migrate
```

Deletion is currently a transactional hard delete because the authoritative
schema has no retention or soft-delete policy. Before production activation,
BE-16 captures successful create, update, and delete actions in the redacted
audit log. Portfolio Marks do not yet create risks, watches, alerts,
or exports automatically.

## Watch API and polling worker (BE-12)

`/api/v1/watches` is the canonical, firm-scoped polling-watch API. All requests
derive the firm only from verified server-side membership. Clients cannot provide
`firmId`/`firm_id`, and every object read, update, and delete includes that firm.
Missing and cross-firm watches both return `404 WATCH_NOT_FOUND`; an inaccessible
referenced mark returns `404 PORTFOLIO_MARK_NOT_FOUND`.

| Method and path | Roles | Result |
|---|---|---|
| `POST /api/v1/watches` | Admin, Attorney | `201` Watch |
| `GET /api/v1/watches` | Admin, Attorney, Viewer | `200` paginated watches |
| `GET /api/v1/watches/:id` | Admin, Attorney, Viewer | `200` Watch |
| `PATCH /api/v1/watches/:id` | Admin, Attorney | `200` Watch |
| `DELETE /api/v1/watches/:id` | Admin, Attorney | `204` |

Create requires `{ "portfolioMarkId": "uuid" }`; it may also include
`state` (`enabled` or `paused`) and `pollIntervalMinutes` (integer 5–43,200).
The default polling interval is `WATCH_POLL_INTERVAL_MINUTES`. A new enabled
watch is due immediately; a paused watch has `nextPollAt: null`. `PATCH` accepts
a non-empty subset of only `state` and `pollIntervalMinutes`; enabling schedules
the next occurrence immediately and pausing clears `nextPollAt`. All server
metadata, IDs, firm IDs, poll timestamps/status, and error code are immutable.

The Watch response is:

```json
{
  "id": "uuid",
  "firmId": "uuid",
  "portfolioMarkId": "uuid",
  "ownerUserId": "uuid-or-null",
  "state": "enabled",
  "pollIntervalMinutes": 1440,
  "nextPollAt": "ISO-8601 timestamp-or-null",
  "lastPolledAt": null,
  "lastPollStatus": null,
  "lastErrorCode": null,
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp"
}
```

Lists return `{ "items": [Watch], "pagination": { "page": 1, "pageSize":
25, "total": 1, "totalPages": 1 } }`, ordered `created_at DESC, id DESC`.
The only filters are `state` and `portfolioMarkId`. Page defaults to 1 and caps
at 100,000; page size defaults to 25 and caps at 100.

Stable API errors include `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401),
`FORBIDDEN` (403), `WATCH_NOT_FOUND` (404), `PORTFOLIO_MARK_NOT_FOUND` (404),
`WATCH_CONFLICT` (409 for a duplicate enabled watch), and `INTERNAL_ERROR`
(500). SQL, Redis errors, mark text, credentials, and tenant details do not
leave the service.

The worker owns the exact Redis list `queue:watch_ingest`. Its version-1 message
contains only `{ version, jobId, watchId, firmId, portfolioMarkId, scheduledFor,
attempt }`; `jobId` is a deterministic SHA-256-derived value from the watch ID
and scheduled occurrence. Redis TTL-backed deduplication and processing locks
make delivery at-least-once and processor work idempotent. Jobs contain no token,
user data, mark text, credentials, or search results.

The scheduler selects a bounded due batch of enabled watches (`next_poll_at <=
now`) under PostgreSQL row locks, enqueues each occurrence independently, and
advances `next_poll_at` only after an enqueue or confirmed duplicate enqueue.
One enqueue failure does not stop the batch. The processor reloads the watch and
current mark under the job's firm, skips deleted/paused/stale/duplicate jobs,
calls risk-enriched search exactly once for a valid job, and returns its
request ID, source statuses, partial state, results, and evidence only as an
internal polling outcome. A federated partial response is recorded as
`partial`, not a worker failure. No alerts or risk-score IDs are created or
persisted; that is BE-13's boundary.

Watch runtime settings are strict and have safe defaults:

```dotenv
WATCH_ENABLED=false
WATCH_SCHEDULER_INTERVAL_MS=60000
WATCH_POLL_INTERVAL_MINUTES=1440
WATCH_SCHEDULER_BATCH_SIZE=50
```

`WATCH_ENABLED=true` requires the existing `SEARCH_ENABLED=true` search runtime.
Disabled mode constructs no watch scheduler/processor runtime and makes no watch
Redis calls. The HTTP server never starts the scheduler. Run it separately:

```sh
pnpm watch:worker
```

The worker stops accepting new work before releasing Redis and PostgreSQL on
SIGINT/SIGTERM. Apply the additive migration only to the intended database; it
is not run automatically:

```sh
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE' pnpm migrate
```

Before production sign-off, deploy the BE-16 migration and verify redacted
successful Watch mutations. Retryable search/database/queue failures are returned with stable
internal codes for deployment-queue retry policy; invalid, missing, stale, and
duplicate jobs are terminal skips.

## Alert evidence and API (BE-13)

Every watch-poll candidate with complete attributed BE-10 evidence is persisted
as immutable risk-score evidence. A canonical SHA-256 fingerprint includes the
firm/watch/mark scope, genuine candidate source/reference, candidate text,
scores, methodology version, and evidence. Object-key and result ordering cannot
change it; `(firm_id, watch_id, fingerprint)` makes replay idempotent. Changed
evidence creates a new snapshot.

The independent `watch-alert-policy-v1.0.0` creates High alerts for High risk,
Medium alerts for Medium risk, and no alert for Low risk. Invalid, incomplete,
unattributed, or unavailable-source entries fail closed. Partial source responses
may persist valid returned entries, but unavailable sources never create alerts.
Each alert references one non-null persisted `riskScoreId` in the same database
transaction; no outbound notification is sent.

| Method and path | Roles | Result |
|---|---|---|
| `GET /api/v1/alerts` | Admin, Attorney, Viewer | `200` paginated alerts |
| `GET /api/v1/alerts/:id` | Admin, Attorney, Viewer | `200` Alert |
| `PATCH /api/v1/alerts/:id` | Admin, Attorney | `200` Alert |

Alert object access derives and scopes by verified firm membership. Missing and
cross-firm records both return `404 ALERT_NOT_FOUND`. Lists support `status`,
`severity`, `watchId`, `portfolioMarkId`, `createdFrom`, and `createdTo`, use
newest-first deterministic ordering, and use the standard bounded pagination.

PATCH is exactly `{ "action": "read" }` (`unread → read`) or
`{ "action": "dismiss" }` (`unread/read → dismissed`). An invalid transition
returns `409 ALERT_STATE_CONFLICT`; Viewers cannot mutate, and there is no alert
deletion endpoint. Responses include attached candidate/evidence scores but omit
fingerprints, Elasticsearch relevance, internal candidate IDs, SQL fields, and
legal conclusions.

The enabled watch worker persists BE-13 evidence before recording a completed or
partial poll. Persistence failure records retryable `ALERT_PERSISTENCE_FAILED`;
replay safety comes from database uniqueness. Apply the additive migration only
to the intended database—it is not run automatically:

```sh
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE' pnpm migrate
```

BE-16 records redacted audit logging for alert read/dismiss actions. Email,
push, and other outbound notification delivery are
not part of BE-13.

## RBAC demonstration routes

Every route verifies the bearer JWT before applying its explicit role list:

- `GET /api/v1/admin/ping`: Admin
- `GET /api/v1/attorney/ping`: Admin or Attorney
- `GET /api/v1/viewer/ping`: Admin, Attorney, or Viewer
- `GET /api/v1/firms/:firmId/ping`: current authenticated firm only

Authenticated users outside a route's list receive `403`; absent or invalid
authentication receives `401`.

## Supabase identity and application authorization

Supabase proves a request's identity; application PostgreSQL remains the source
of truth for firm membership and the `admin`, `attorney`, and `viewer` roles.
The two databases are separate, so this project does not use a Supabase Custom
Access Token Hook and does not place application roles in Supabase JWT claims.

Migration `004_add_supabase_user_identity.sql` adds the nullable, unique
`users.supabase_user_id` link. It has no foreign key because `auth.users` is in a
different database. On the first verified Supabase request, the backend first
looks for this stable ID. If it is not linked, it lower-cases and trims the email
from the verified token, fetches that user through Supabase's server-only Admin
API, and requires the authoritative `email_confirmed_at` value to be present. The
authoritative email must also match the verified token email after normalization.
Only then does it link a local row whose stored email is an exact match and whose
link is still null. It never trusts JWT `user_metadata` as proof of email ownership
and never guesses a firm from an email domain. Unconfirmed users, mismatched
emails, API failures, and link conflicts all fail closed. Long term,
administrator-controlled provisioning is safer than automatic email linking.

The Admin lookup uses `SUPABASE_SECRET_KEY`, which must be configured only in the
backend environment and must never be exposed to browsers, logs, or source
control. It happens only on the first-link path: Redis cache hits and users already
linked by `supabase_user_id` do not call the Supabase Admin API.

Resolved membership is cached in Redis under
`role-cache:<supabase_user_id>` for exactly **60 seconds**. In plain language, a
role, seat, or firm change can take at most 60 seconds to affect an already active
user if the cache is not explicitly cleared. This short cache avoids a database
query on every API request while bounding stale authorization. Changing the
PostgreSQL row does not rewrite the cache entry. Role/seat mutation endpoints
must call `RedisRoleFirmResolver.invalidate(supabaseUserId)` after committing the
change.

`PATCH /api/v1/users/:id/role` is the Admin-only role mutation. It updates
`users.role` in the same PostgreSQL transaction as its audit row and explicitly
invalidates the target's role cache before the transaction reports success.

Protected routes use Supabase verification. The local token verifier and
`PROTECTED_AUTH_MODE` have been retired.

To exercise the live boundary, provide a fresh dedicated-user token only through
the ignored `SUPABASE_TEST_ACCESS_TOKEN` environment variable, ensure that a
matching local user exists, then run:

```sh
pnpm verify:supabase-rbac
```

The command verifies the real Supabase token, performs the authoritative Admin
email check if the identity still needs its first link, observes a PostgreSQL
membership lookup followed by a Redis cache hit, and checks an allowed route
returns `200` while a disallowed route returns `403`. It prints no token, email,
firm ID, secret key, or complete claims payload.

## BE-15 authentication rate limiting

`auth-rate-limit-policy-v1` is a Redis-backed, atomic limiter shared by API
instances. It applies to every backend-owned sensitive authentication flow:
public invitation lookup/redemption, authenticated firm provisioning, and Admin
invitation issuance. `GET /api/v1/me` and ordinary authenticated application
routes are intentionally not limited by this policy. This backend does not own
login, password recovery/resend, refresh-token, logout, or session-revocation
endpoints: the browser calls Supabase directly for those flows. Express cannot
intercept those browser-to-Supabase requests, so the equivalent platform-side
Supabase Auth protection remains a deployment requirement.

The policies are: `loginIp` 20 / 900 seconds, `loginIdentity` 5 / 900,
`recoveryIp` and `recoveryIdentity` 5 / 3,600, `refreshSession` 30 / 300, and
`logoutIp` 60 / 60. IP policies count all requests. Future backend credential
handlers must increment identity counters only after failed authentication and
clear that identity counter after success. Recovery must keep an identical
response regardless of account existence; refresh may only use a server-side
opaque session ID, never a complete bearer token.

Redis keys have the fixed format `auth-limit:v1:{policy}:{hmac}`. The final
component is HMAC-SHA256 using `AUTH_RATE_LIMIT_KEY_SECRET`; raw IPs, emails,
session IDs, tokens, and credentials are never stored in keys or logs. Each key
expires with its policy window. The Lua increment/expiry operation makes
concurrent decisions atomic. This is at-least-once operational protection, not
a substitute for account security monitoring; monitor only policy/code/count
aggregates and sanitized Redis availability signals.

Rate-limited requests return `429` with `Retry-After`, `RateLimit-Limit`,
`RateLimit-Remaining`, and delta-seconds `RateLimit-Reset` headers plus:

```json
{
  "error": {
    "code": "AUTH_RATE_LIMITED",
    "message": "Too many authentication attempts. Try again later."
  }
}
```

Redis unavailability fails closed with `503 AUTH_RATE_LIMIT_UNAVAILABLE` for
login, registration/invitation, recovery, and refresh flows. A future
backend-owned logout/session-revocation route must use the supplied open-mode
`logoutIp` limiter: it remains available while emitting only a sanitized
operational warning. There is no in-memory fallback.

Configure the limiter separately from JWT, Supabase, and database secrets:

```dotenv
AUTH_RATE_LIMIT_ENABLED=true
AUTH_RATE_LIMIT_KEY_SECRET=at-least-32-bytes-of-a-separate-secret
AUTH_LOGIN_IP_LIMIT=20
AUTH_LOGIN_IDENTITY_LIMIT=5
AUTH_LOGIN_WINDOW_SECONDS=900
AUTH_RECOVERY_LIMIT=5
AUTH_RECOVERY_WINDOW_SECONDS=3600
AUTH_REFRESH_LIMIT=30
AUTH_REFRESH_WINDOW_SECONDS=300
TRUST_PROXY_HOPS=0
```

All numeric values are bounded and booleans are strict. The limiter can be
disabled only with `NODE_ENV=development` or `NODE_ENV=test`; production must
provide the separate 32-byte minimum key secret. `TRUST_PROXY_HOPS=0` is the
safe direct-connection default and ignores arbitrary `X-Forwarded-For` values.
For a deployed reverse-proxy chain, set it to the exact number of trusted hops
(for example, `1` for one terminating proxy), never `app.set('trust proxy',
true)`. Construction performs no Redis operation; the existing system Redis
client lifecycle is reused. BE-15 has no database migration.

BE-14 billing remains deferred. The error handler intentionally logs no request
body or password.

## BE-16 immutable audit log

BE-16 is code-complete. Migration `009_create_audit_logs.sql` is additive and
idempotent but **has not been applied** by this work. It creates firm-scoped
`audit_logs` with the actor's local `users.id`, UTC `occurred_at`/`created_at`,
JSON object checks, a meaningful-data check, list-query indexes, and a database
trigger which rejects every `UPDATE` and `DELETE`. The application repository
has only `insert`, `list`, and `findById` operations.

The frozen taxonomy is:

- Portfolio marks: `portfolio_mark.created`, `.updated`, `.deleted`
- Watches: `watch.created`, `.updated`, `.deleted`, `.enabled`, `.disabled`
- Alerts: `alert.read`, `alert.dismissed` (there is no reopen transition)
- Roles: `user.role_changed`
- Exports: `export.requested`, `.completed`, `.failed`

Entity types are `portfolio_mark`, `watch`, `alert`, `user`, and `export`.
Unsupported actions or entity types fail with `AUDIT_ACTION_INVALID` or
`AUDIT_ENTITY_TYPE_INVALID`. The public mutation routes take firm and actor
identity only from verified server context; neither is accepted from a body.

Portfolio create/update/delete, Watch create/update/delete (including distinct
enabled/disabled transitions), Alert read/dismiss, and user-role changes write
their audit event through the same PostgreSQL client transaction. Failed audit
inserts roll back mutations; failed/missing/cross-firm mutations emit no success
event. Snapshot projections retain useful legal fields such as genuine registry
references, but omit unnecessary profile data and complete nested alert evidence.

The `AuditService` accepts:

```js
auditService.record({
  transaction, firmId, actorUserId, action, entityType, entityId,
  beforeState, afterState, metadata, requestContext, occurredAt,
})
```

It accepts a caller-owned transaction without committing it, and also supports
direct server-side lifecycle recording when no enclosing transaction exists.
`AuditLogRepository` maps the verified Supabase subject to the current local
`users.id` inside its scoped insert, satisfying the audit foreign key without
trusting a client-supplied actor ID. Stable codes include
`AUDIT_ACTION_INVALID`, `AUDIT_ENTITY_TYPE_INVALID`, `AUDIT_ENTITY_ID_INVALID`,
`AUDIT_ACTOR_INVALID`, `AUDIT_FIRM_INVALID`, `AUDIT_PAYLOAD_INVALID`,
`AUDIT_PAYLOAD_TOO_LARGE`, `AUDIT_TRANSACTION_REQUIRED`, `AUDIT_WRITE_FAILED`,
and `AUDIT_LOG_NOT_FOUND`.

Audit state and metadata are recursively copied, key-sorted, depth/array/size
bounded JSON. Case-insensitive password, token, authorization, cookie, secret,
API/private/client key, JWT, and session-token fields become `[REDACTED]`.
Prototype-pollution keys are omitted; circular references, functions, symbols,
bigints, non-finite numbers, accessors, and non-JSON objects are rejected. The
backend never automatically records a request body, raw Authorization header,
Cookie header, generated export data, signed URL, or stack trace, and never logs
audit payloads.

Every request receives an audit request context containing a valid existing
`X-Request-ID` or generated UUID, a normalized client IP, and a bounded
User-Agent. Forwarded IP resolution uses Express's configured
`TRUST_PROXY_HOPS`; raw `X-Forwarded-For` is never read. Absent/oversized values
become `null`.

`GET /api/v1/audit-logs` is authenticated and Admin-only. It always takes the
firm from membership and returns `{ auditLogs, nextCursor }` ordered
`occurredAt DESC, id DESC`. Optional filters are `actorUserId`, `action`,
`entityType`, `entityId`, `occurredFrom`, and `occurredTo`; cursor and page size
are bounded (default 25, maximum 100). Attorney and Viewer callers receive the
standard `403 FORBIDDEN`; there are no audit-log mutation routes.

`PATCH /api/v1/users/:id/role` accepts exactly
`{ "role": "admin" | "attorney" | "viewer" }`, is Admin-only, hides
cross-firm users with `USER_NOT_FOUND`, rejects unsupported/no-op roles, and
prevents demoting the last active Admin. A self-demotion is allowed only if a
different active Admin remains. `users.role` is the sole authoritative source;
Supabase custom claims are not used by this architecture, so no Supabase write
or token refresh is needed. The resolver cache invalidation means the next
request reloads membership/role from PostgreSQL.

`ExportAuditService` is the server-internal lifecycle hook for `requested`,
`completed`, and `failed` events. BE-20 calls it transactionally for each
export transition with only the internal export UUID, type, PDF format, bounded
summary, byte size/checksum on completion, and a stable error code on failure.
It never receives a PDF, result set, storage key, signed URL, or credential.

The reviewed but deliberately excluded mutations are firm provisioning,
invitation issuance/redemption, watch-worker poll bookkeeping, registry
ingestion/projection, and BE-13 system-generated risk/alert persistence. They
are identity bootstrap or unattended operational work without an authenticated
firm actor and have no approved BE-16 taxonomy action; they create no fake human
audit event. Retention/archival duration is an operational policy decision, not
implemented as a delete path (which the database forbids).

Operational deployment gates only:

1. Review and apply migration `009_create_audit_logs.sql` through the normal
   controlled migration process (it was not applied here).
2. Confirm the application database role has only the required write/read
   privileges and that backup/retention operations respect append-only policy.
3. Configure the exact trusted proxy hop count and validate request IDs/IPs in
   staging.
4. Monitor audit insertion failures and establish the organization's immutable
   retention/archive policy.
5. When BE-20 is deployed, wire every export lifecycle transition to
   `ExportAuditService` before enabling generation.

## BE-17 Phase 2 backend exit check

BE-17 is **code-complete, staging verification pending**. The traceable route,
authorization, migration, and security matrix is in
[`../Documentations/08-phase2-backend-exit-check.md`](../Documentations/08-phase2-backend-exit-check.md).
It uses the canonical backend contracts rather than frontend/mock candidate
routes and explicitly records BE-14 billing as deferred.

The application-level `phase2-route-inventory.test.js` sends requests through
`createApp` with injected fakes. It verifies every mounted non-deferred Phase 2
HTTP method reaches its route before the terminal 404 handler and confirms that
enabled search is available. The same test file covers unauthenticated,
Admin, Attorney, Viewer, Admin-only audit/role, and cross-firm paths. Existing
service tests remain the evidence for transaction boundaries, IDOR concealment,
queue validation, audit immutability, and rate-limit fail-closed behavior.

Run the no-network deployment-configuration check with:

```bash
pnpm --dir backend phase2:readiness
```

It reuses `loadConfig` without opening clients or starting services. A gated
result is a deployment gate, not a unit-test failure. Phase 2 staging needs a
valid PostgreSQL URL, Redis URL, Supabase configuration, required JWT and
rate-limit secrets, `SEARCH_ENABLED=true` plus bounded Elasticsearch registry
settings, and `WATCH_ENABLED=true` so the worker path is created.

The opt-in staging runner is never included in normal tests or CI:

```bash
STAGING_API_URL=https://api.staging.example.test/api/v1 \
STAGING_ACCESS_TOKEN=... \
STAGING_ADMIN_ACCESS_TOKEN=... \
pnpm --dir backend test:staging-smoke
```

It rejects localhost and production-looking hosts unless
`STAGING_SMOKE_ALLOW_UNSAFE_URL=true` is deliberately supplied. It does not
print credentials, cookies, complete response bodies, or request bodies; it
uses a 5-second bounded default timeout (15 seconds maximum) and rejects HTTP
redirects so a bearer token is never forwarded to an unexpected host. Default checks
are authenticated GETs. Mutation coverage additionally requires both
`STAGING_SMOKE_ALLOW_MUTATIONS=true` and `STAGING_MUTATION_ACCESS_TOKEN`; it
creates a uniquely labelled portfolio mark and only patches/deletes the UUID
returned by that same create response; a missing or malformed UUID fails the
smoke check without attempting cleanup. It never runs migrations, billing,
role-demotion, index deletion, or infrastructure operations.

For a fully complete Phase 2 exit, apply `006`–`009` to disposable staging,
verify real Supabase tokens, PostgreSQL, Redis, Elasticsearch and enabled watch
worker paths, demonstrate a controlled partial registry failure, run every
non-deferred endpoint smoke check, and formally accept or complete the separate
BE-14 billing exception. BE-14 remains **Deferred by explicit decision** here;
no billing route was added.

## BE-18 Office Action research and portfolio links

BE-18 supplies firm-scoped Office Action research links and a feature-gated,
injected search boundary. Migration `010_create_office_action_refs.sql` is
additive and **has not been applied**. It creates attributed source references
linked by `(firm_id, portfolio_mark_id)`, a unique genuine
`(firm, mark, registry, source reference)` link, bounded object-only metadata,
lookup indexes, and extends the closed BE-16 audit taxonomy with
`office_action_ref.created`, `.updated`, and `.deleted`.

`GET /api/v1/office-actions/search` requires authenticated Admin, Attorney, or
Viewer access. It is mounted only when
`OFFICE_ACTION_SEARCH_ENABLED=true` and an adapter is injected. The normalized
query has `applicationNumber`, `markText`, `owner`, date range,
`documentTypes`, `jurisdictions`, and bounded `maxResults`; at least one
criterion is required. Its response preserves source order, genuine registry
provenance, nulls, `{ sourceStatuses, partial, requestId }`, and only four
allow-listed source metadata fields. Failed, timed-out, or malformed sources
become unavailable while healthy source results remain. No raw registry
payload, source stack trace, legal conclusion, or generated summary is exposed.

No live/licensed provider is fabricated. A source is injected as:

```js
{ sourceName: 'USPTO', searchOfficeActions: async (query) => [] }
```

Construction does not call the adapter. A licensed provider implementation,
its credentials, and staging provenance validation are operational gates.

The stored-reference API is available independently of the search feature:

- `POST/GET /api/v1/portfolio-marks/:portfolioMarkId/office-action-refs`
- `GET/PATCH/DELETE /api/v1/portfolio-marks/:portfolioMarkId/office-action-refs/:id`

Admin and Attorney can create/update/delete; Viewer is read-only. The server
uses authenticated firm and actor context only. Missing/cross-firm marks return
`PORTFOLIO_MARK_NOT_FOUND`; missing/cross-firm nested references return
`OFFICE_ACTION_REF_NOT_FOUND`; duplicate genuine links return
`OFFICE_ACTION_REF_CONFLICT`.

Create requires a source registry, genuine source reference, document type, and
explicit summary method (`registry`, `manual`, or `extracted`). Summaries are
optional bounded plain text. `registry` identifies source-provided material;
manual/extracted summaries are research notes, never represented as verbatim
examiner speech. BE-18 includes no AI summarizer, legal determination, advice,
invented statute, refusal ground, or deadline. Each mutation writes its redacted
before/after audit event in the same PostgreSQL transaction. Raw documents,
payloads, headers, and credentials are neither stored nor audited.

Configuration defaults to disabled:

```text
OFFICE_ACTION_SEARCH_ENABLED=false
OFFICE_ACTION_SOURCE_REGISTRIES=USPTO        # required only when enabled
OFFICE_ACTION_SOURCE_TIMEOUT_MS=3000         # 100–60000
OFFICE_ACTION_SEARCH_MAX_RESULTS=25          # 1–100
```

BE-18 does not resolve any BE-17 Phase 2 staging gate and does not change the
explicitly deferred BE-14 billing status.

## BE-19 immutable search snapshots

Every successful authenticated `GET /api/v1/search` now creates or reuses one
firm-scoped immutable `search_results` snapshot before its response is sent.
The response is additively `{ searchId, results, sourceStatuses, partial,
requestId }`; all result `searchId` values equal the top-level UUID, including
for zero-result searches. The search service receives the trusted request-context
ID, so a retry carrying the same valid request ID is idempotent only when its
normalized query and complete result/evidence snapshot are equivalent. A
different snapshot with that ID returns `409 SEARCH_SNAPSHOT_CONFLICT`.

Snapshots contain only the normalized public query, ordered public results,
registry provenance, complete risk evidence, source statuses, partial flag,
result count, and the distinct methodology versions used at execution. They
preserve nullable owner, filing date, and conceptual score values. They never
store raw Elasticsearch responses, relevance scores, headers, cookies,
credentials, request bodies, or infrastructure errors. Snapshot validation
rejects unsafe/circular/non-finite values, prototype-pollution keys, malformed
provenance/evidence, excessive arrays, and payloads over 256 KiB without
mutating caller objects.

Snapshot insert and the single `search.executed` audit event share one PostgreSQL
transaction. The audit event records only `{ searchId, resultCount, partial,
methodologyVersions }` plus bounded source/count metadata. An audit or snapshot
write failure rolls the transaction back and returns a safe write failure; no
search response claims persistence succeeded.

`GET /api/v1/search-results/:id` returns the exact stored historical query,
results, statuses, partial state, methodology versions, request ID, and creation
time after authenticated Admin/Attorney/Viewer firm-scoped lookup. It never
reruns Elasticsearch or risk scoring. `GET /api/v1/search-results` returns
bounded cursor-paginated summaries (`createdAt DESC, id DESC`); Admin can filter
the firm by requester while Attorney and Viewer are restricted to their own
history. There are no update/delete snapshot routes.

`SearchResultService.loadSearchSnapshotForExport({ firmId, actorUserId,
searchResultId })` is the server-only BE-20 reuse boundary. It returns the stored
snapshot unchanged after firm/actor validation; it creates no PDF, signed URL,
or export event and performs no search/risk call. BE-20 must use this loader and
the existing `ExportAuditService` lifecycle hooks rather than recalculate a
historical search.

Migration `011_create_search_results.sql` is additive/repeat-safe and was not
applied here. Search snapshots can contain client research information, so their
retention/expiry and any authorized cleanup process remain operational/legal
policy decisions. BE-19 does not resolve existing BE-17/BE-18 staging gates or
the deferred BE-14 billing exception.

## BE-20 asynchronous PDF exports

BE-20 adds a feature-gated, firm-scoped PDF export pipeline. Migration
`012_create_exports.sql` is additive/repeat-safe and **was not applied**. It
creates lifecycle records only; PDF bytes, signed URLs, and public storage
locations are never stored in PostgreSQL. The `(firm_id, idempotency_key)`
constraint makes safe client retries deterministic. Export rows move only
`queued → processing → completed|failed`; completed rows require a private PDF
key, MIME type, byte size, SHA-256 checksum, and completion time, while failed
rows require only a stable bounded failure code.

The API is available only when `PDF_EXPORT_ENABLED=true`:

- `POST /api/v1/exports` accepts `{ type, sourceEntityId, parameters,
  idempotencyKey }` and returns `202` for newly queued work or the existing
  equivalent export for a retry.
- `GET /api/v1/exports` returns bounded cursor-paginated summaries ordered
  `createdAt DESC, id DESC`.
- `GET /api/v1/exports/:id` returns one firm-scoped lifecycle record.
- `GET /api/v1/exports/:id/download` streams only a completed private PDF.

Admin and Attorney may create, inspect, and download exports; Viewer is denied.
Firm identity and requester identity always derive from verified membership;
missing/cross-firm exports are `404 EXPORT_NOT_FOUND`. Attorney listing is
restricted to that attorney's own requested exports, while Admin listing is
firm-wide. The API never returns storage keys, filesystem paths, signed URLs,
credentials, or raw storage/worker errors. Stable errors include
`EXPORT_NOT_FOUND`, `EXPORT_REQUEST_INVALID`, `EXPORT_CURSOR_INVALID`,
`EXPORT_IDEMPOTENCY_CONFLICT`, `EXPORT_QUEUE_UNAVAILABLE`,
`EXPORT_NOT_READY`, `EXPORT_DOWNLOAD_UNAVAILABLE`, `EXPORT_SOURCE_NOT_FOUND`,
`EXPORT_JOB_INVALID`, `EXPORT_RENDER_INVALID`, and
`EXPORT_PROCESSING_FAILED`.

Supported source loaders are deliberately evidence-first. `search_results` and
`risk_report` use BE-19's server-only `loadSearchSnapshotForExport()` boundary,
select the exact stored result evidence where requested, and never rerun
Elasticsearch or risk scoring. `portfolio_summary` uses only firm-scoped
portfolio, attributed Office Action, and bounded current watch/alert records.
The document model is plain bounded data—not request-built HTML—and preserves
genuine registry references and nullable values as “Not available.” It makes no
legal conclusion or recommendation. PDFs visibly disclose partial/unavailable
sources, separate Visual/Phonetic/Class evidence, use text risk labels in
addition to any presentation color, include source attribution, export ID,
UTC generation time, page numbers, and the research-assistance/not-legal-advice
disclaimer.

No PDF package was present in the locked dependency set and this work does not
make network/package-manager calls. The injected `PdfRenderer` therefore uses a
small static server-side PDF 1.4 text emitter with built-in Helvetica rather
than a browser, remote HTML renderer, CDN, remote font/image/CSS fetch, active
content, JavaScript, or attachments. It normalizes/escapes text and bounds
result, line, page, and byte counts. This is deterministic at the document-model
layer and has no external rendering dependency.

Storage is injected behind `{ put, get, delete }`. The enabled runtime defaults
only to an explicitly configured absolute private filesystem root; it has no
public-bucket fallback. Server-generated keys are exactly
`exports/<firm UUID>/<export UUID>.pdf`; traversal and arbitrary-file paths are
rejected. The worker computes SHA-256 and validates PDF byte bounds before
marking completion. Tests use `InMemoryPdfStorage` only.

The dedicated Redis queue is `queue:pdf_export` by default. Its version-1 job
is `{ version, jobId, exportId, firmId, scheduledFor, attempt }`; it validates
every field, uses a bounded lock/dedupe pattern, atomically claims queued rows,
and supports at-least-once delivery without duplicate rendering. The separate
worker is started only with:

```bash
pnpm --dir backend pdf-export:worker
```

Retryable queue/render/storage/audit failures are bounded by
`PDF_EXPORT_MAX_ATTEMPTS`; invalid, missing-source, and invalid-render inputs
are terminal. Failed rows retain only a stable code, never a stack trace. On a
completion-persistence failure the worker removes a just-uploaded private
object where safely possible. `export.requested` is inserted in the same
transaction as export creation; `export.completed` and `export.failed` share
their corresponding transition transactions. Audit metadata excludes PDFs,
storage keys, URLs, tokens, cookies, raw search data, and stack traces.

Configuration is strict and disabled by default:

```text
PDF_EXPORT_ENABLED=false
PDF_EXPORT_QUEUE_KEY=queue:pdf_export
PDF_EXPORT_MAX_BYTES=10485760
PDF_EXPORT_MAX_PAGES=100
PDF_EXPORT_MAX_RESULTS=50
PDF_EXPORT_MAX_ATTEMPTS=3
PDF_EXPORT_STORAGE_PROVIDER=filesystem       # required when enabled
PDF_EXPORT_STORAGE_ROOT=/private/exports     # required when enabled
```

Disabled mode constructs no PDF queue or storage runtime and all export paths
return the existing terminal `404 NOT_FOUND`. Enabling requires a private
filesystem root, Redis, PostgreSQL migration application, and worker process.
Live Redis/storage permissions and disposable-staging export verification are
operational gates. BE-20 does not change the deferred BE-14 billing decision or
any existing Phase 2/BE-18 staging gate.
