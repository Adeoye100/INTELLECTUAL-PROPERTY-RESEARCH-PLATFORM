# IPRP backend foundation

This service implements the `/api/v1` authentication foundation on the locked
Node.js + Express, PostgreSQL, and Redis stack. It intentionally does not contain
business APIs, password-reset/email-verification logic, rate limiting, or audit
logging.

It also contains the BE-07/BE-08 USPTO registry adapters and the explicitly
Postgres-first trademark ingestion/projection commands described below.

## Federated search core (BE-09A)

`FederatedSearchService` is an infrastructure-independent orchestration core;
it does not add an HTTP route or call Elasticsearch or external registries. Give
it one or more sources shaped as `{ sourceName: 'USPTO', search: async (query) => [] }`.
Its `search(query)` runs every source concurrently and returns
`{ results, sourceStatuses, partial, requestId }`. Source failures and invalid
non-array outputs are isolated as `unavailable`, while healthy source results
and their registry attribution are returned in configured-source order. Risk
scores are intentionally not calculated here; that remains BE-10 work.

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

There is currently no backend endpoint that changes or removes an existing
user's role/seat. Invitation acceptance creates a new local user but does not
change an already linked membership, so there is no role-cache invalidation hook
to wire yet. SB-04 or the future membership-management endpoint must add it when
that state change is implemented.

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

## Deferred security hooks

- **BE-15:** Redis-backed IP/account rate limiting belongs immediately before the
  public auth handlers, including invitation lookup/redemption, in
  `src/routes/auth-routes.js`.
- **BE-16:** redacted audit events belong after successful auth state changes and,
  specifically, after invitation issuance and redemption. The hook points are
  marked in `src/auth/auth-service.js`; the error handler intentionally logs no
  request body or password.
