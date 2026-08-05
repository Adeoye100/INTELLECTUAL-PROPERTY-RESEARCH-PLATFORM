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

## Firm matching and initial roles

Self-serve signup matches a firm by its normalized name: trim leading/trailing
whitespace, collapse internal whitespace, and compare case-insensitively. A
PostgreSQL expression unique index makes that rule race-safe. Email-domain matching
was not selected because the documented schema has no authoritative firm-domain
field and consumer/shared domains would produce unsafe tenant joins.

The first user for a new firm is `admin`; an additional self-serve user matching
an existing firm receives the least-privileged `viewer` role. Production rollout
should pair existing-firm admission with the separately scoped invitation and
email-verification contracts rather than treating the submitted name as proof of
firm membership.

## Auth API

| Method and path | Body | Result |
|---|---|---|
| `POST /api/v1/auth/signup` | `{ firmName (or company), email, password }` | `201` access/refresh pair, user role, firm |
| `POST /api/v1/auth/login` | `{ email, password }` | `200` access/refresh pair; records `last_login_at` |
| `POST /api/v1/auth/refresh` | `{ refreshToken }` | `200` new access token and rotated refresh token |
| `POST /api/v1/auth/logout` | `{ refreshToken }` | `204`; Redis session invalidated |

Access JWTs contain the verified user ID, firm ID, email, and role. Refresh tokens
are opaque random values; only a SHA-256-derived key and minimal session state are
stored in Redis with a TTL. Refresh rotates the token atomically via `GETDEL`, and
reloads the user from PostgreSQL before signing claims.

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
