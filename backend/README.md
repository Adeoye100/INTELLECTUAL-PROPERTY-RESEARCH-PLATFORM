# IPRP backend foundation

This service implements the `/api/v1` authentication foundation on the locked
Node.js + Express, PostgreSQL, and Redis stack. It intentionally does not contain
business APIs, password-reset/email-verification logic, rate limiting, or audit
logging.

It also contains the BE-07/BE-08 USPTO registry adapters and the explicitly
Postgres-first trademark ingestion/projection commands described below.

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
`.env.example`. `JWT_ACCESS_SECRET` must be at least 32 bytes. Firm invitations
default to seven days and can be configured with `INVITE_TOKEN_TTL_SECONDS`.

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
`trademarks_composite` index. `sync:elasticsearch` selects new/changed Postgres
rows, submits them through that projector, and marks the exact projected row
version only after the bulk request succeeds. The registry adapter never receives
an Elasticsearch client.

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

Self-serve signup reads `firmName`, falling back to the frontend-compatible
`company` field. It trims leading/trailing whitespace, collapses every run of
internal whitespace to one space, and lower-cases the result. The repository then
compares it with the same normalized PostgreSQL expression. A unique expression
index and transaction-scoped advisory lock make the check race-safe.

Self-serve signup can only create a new firm, whose first user is `admin`. If the
normalized name already exists, signup returns `409 FIRM_ALREADY_EXISTS` with a
message directing the user to request an invitation. A name match never grants a
role or tenant membership.

Joining an existing firm requires an Admin-issued invitation. The signed JWT binds
the invitation ID, firm ID, normalized email, intended role, and expiry. The
database stores the authoritative invitation row. Acceptance locks that row,
checks the signed claims against it, creates the user with the stored role, and
marks the invitation used in one transaction. Expired and already-used invitations
return `410 EXPIRED_LINK`; invalid or altered tokens return `403`.

## Auth API

| Method and path | Body | Result |
|---|---|---|
| `POST /api/v1/auth/signup` | `{ firmName (or company), email, password }` | `201` access/refresh pair, user role, firm |
| `POST /api/v1/auth/signup` | `{ inviteToken, fullName?, email?, password }` | `201` invite redemption; the optional email must match the invitation |
| `POST /api/v1/admin/invitations` | `{ fullName, email, role }` plus Admin bearer token | `201` signed token, expiry, email, firm name, and role |
| `GET /api/v1/auth/invitations/:token` | None | `200` invitation email, firm name, and role when usable |
| `POST /api/v1/auth/invitations/:token/accept` | `{ fullName, password }` | `201` access/refresh pair plus frontend-compatible `token` and `expiresAt` aliases |
| `POST /api/v1/auth/login` | `{ email, password }` | `200` access/refresh pair; records `last_login_at` |
| `POST /api/v1/auth/refresh` | `{ refreshToken }` | `200` new access token and rotated refresh token |
| `POST /api/v1/auth/logout` | `{ refreshToken }` | `204`; Redis session invalidated |

Access JWTs contain the verified user ID, firm ID, email, and role. Refresh tokens
are opaque random values. Redis uses `session:<SHA-256(refresh token)>` as the key;
the value is JSON containing only `userId` and `createdAt`. The raw refresh token
is not stored in either the Redis key or value. Sessions have a TTL, refresh
rotates the lookup key atomically via `GETDEL`, and the service reloads the user
from PostgreSQL before signing new access claims.

The current JSON-body refresh transport is an explicit foundation contract. A
browser deployment must decide whether to move it to an HttpOnly/Secure/SameSite
cookie and add the corresponding CSRF policy before production.

## RBAC demonstration routes

Every route verifies the bearer JWT before applying its explicit role list:

- `GET /api/v1/admin/ping`: Admin
- `GET /api/v1/attorney/ping`: Admin or Attorney
- `GET /api/v1/viewer/ping`: Admin, Attorney, or Viewer

Authenticated users outside a route's list receive `403`; absent or invalid
authentication receives `401`.

## Deferred security hooks

- **BE-15:** Redis-backed IP/account rate limiting belongs immediately before the
  public auth handlers, including invitation lookup/redemption, in
  `src/routes/auth-routes.js`.
- **BE-16:** redacted audit events belong after successful auth state changes and,
  specifically, after invitation issuance and redemption. The hook points are
  marked in `src/auth/auth-service.js`; the error handler intentionally logs no
  request body or password.
