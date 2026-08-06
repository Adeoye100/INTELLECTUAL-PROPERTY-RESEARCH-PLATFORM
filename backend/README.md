# IPRP backend foundation

This service implements the `/api/v1` authentication foundation on the locked
Node.js + Express, PostgreSQL, and Redis stack. It intentionally does not contain
business APIs, password-reset/email-verification logic, rate limiting, or audit
logging.

## Local services and configuration

The documented local assumption is Docker Compose with PostgreSQL 16 and Redis 7:

```sh
docker compose up -d
cp .env.example .env
set -a; . ./.env; set +a
pnpm migrate
pnpm test
pnpm start
```

The Compose initialization creates both `iprp` and disposable `iprp_test`
databases. Integration tests require `TEST_DATABASE_URL` and `TEST_REDIS_URL` and
fail instead of silently substituting in-memory stores. Use only disposable test
stores; Redis database 15 is selected in `.env.example` to isolate test sessions.

All required environment variables and token lifetimes are documented in
`.env.example`. `JWT_ACCESS_SECRET` must be at least 32 bytes.

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

## Firm matching and initial roles

Self-serve signup reads `firmName`, falling back to the frontend-compatible
`company` field. It trims leading/trailing whitespace, collapses every run of
internal whitespace to one space, and lower-cases the result. The repository then
performs an exact equality comparison against the same normalized PostgreSQL
expression. It does not derive or compare a domain from the user's email. A unique
expression index and transaction-scoped advisory lock make this exact matching
rule race-safe.

The first user for a new firm is `admin`; an additional self-serve user matching
an existing firm receives the least-privileged `viewer` role.

**This matching rule is not safe for production tenant admission.** An unrelated
person can submit an existing firm's public name and receive Viewer access, two
unrelated firms can legitimately share a normalized name, and aliases or spelling
differences can split one firm into multiple tenants. Before real client data is
stored, existing-firm signup must require an explicit single-use firm invitation
or another verified administrator-controlled membership claim. Name normalization
may remain a duplicate-warning signal, but must not grant tenant membership.

## Auth API

| Method and path | Body | Result |
|---|---|---|
| `POST /api/v1/auth/signup` | `{ firmName (or company), email, password }` | `201` access/refresh pair, user role, firm |
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
  public auth handlers in `src/routes/auth-routes.js`.
- **BE-16:** redacted audit events belong after successful auth state changes and,
  later, protected business mutations. The error handler intentionally logs no
  request body or password.
