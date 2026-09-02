# P2-01 Firm-scoped portfolio contract

## Status

The browser routes `/portfolio` and `/portfolio/:markId` use the authenticated backend route family `/api/v1/portfolio-marks`. The shared client owns the `/api/v1` prefix. No production deployment or migration application is part of this ticket.

## Canonical record

`PortfolioMark` contains `id`, `firmId`, nullable `ownerUserId`, `markText`, `jurisdiction`, `sourceRegistry`, `registryReference`, `niceClasses`, normalized `status`, nullable `filingDate`, `registrationDate`, and `renewalDate`, plus ISO `createdAt` and `updatedAt` timestamps. Calendar dates are serialized as `YYYY-MM-DD`. `ownerUserId` identifies the application user associated with record creation; it is not a legal trademark proprietor field.

Statuses are `pending`, `filed`, `registered`, `abandoned`, `expired`, and `cancelled`. `draft` is rejected.

The list contract is:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0
  }
}
```

Supported filters are `page`, `pageSize`, `query`, `status`, `jurisdiction`, `sourceRegistry`, exact `registryReference`, `niceClass`, `renewalBefore`, and `renewalAfter`. `query` is normalized, limited to 200 characters, searched case-insensitively, escaped as a literal pattern, parameterized, and combined with the authenticated firm predicate.

## Endpoints and permissions

| Endpoint | Admin | Attorney | Viewer |
|---|---:|---:|---:|
| `GET /api/v1/portfolio-marks` | Read | Read | Read |
| `GET /api/v1/portfolio-marks/:id` | Read | Read | Read |
| `POST /api/v1/portfolio-marks` | Create | Create | 403 |
| `PATCH /api/v1/portfolio-marks/:id` | Update | Update | 403 |
| `DELETE /api/v1/portfolio-marks/:id` | Backend-only lifecycle contract | Backend-only lifecycle contract | 403 |

The server derives firm and actor identity from the verified membership. Browser-supplied firm, owner, role, or audit-actor fields are rejected. Missing and cross-firm mark IDs both return `404 PORTFOLIO_MARK_NOT_FOUND`.

## Lifecycle decision

No migration is added. Migration `006_create_portfolio_marks.sql` remains unchanged.

Hard deletion is not exposed in the UI. `watches`, `risk_scores`, `alerts`, and `office_action_refs` have restrictive foreign keys to portfolio marks. A recoverable archive model needs a separate product and retention decision; silently cascading dependent legal/research records is not appropriate.

## Deferred capabilities

The active portfolio UI does not expose CSV import, search import, watches, attachments, downloads, status history, registry synchronization, risk scoring, PDF export, office actions, or external workers. Existing source for later phases remains unreachable behind feature-unavailable routes and is not evidence of a live portfolio contract.

## Dashboard integration

Dashboard portfolio totals, status counts, and renewal counts query `portfolio_marks` with `firm_id = $1`. A zero-row firm returns zero metrics. Portfolio mutations invalidate both portfolio and dashboard query families in the browser. Renewal filters in the portfolio UI are generated from UTC calendar dates.

## Local verification

```text
pnpm --dir backend check
node --test backend/test/unit/portfolio-marks.test.js backend/test/unit/audit.test.js backend/test/unit/dashboard-analytics.test.js
pnpm --dir backend migration:check
pnpm --dir backend openapi:check
pnpm --dir frontend lint
pnpm --dir frontend exec tsc -b
pnpm --dir frontend exec vitest run src/features/portfolio/portfolioDomain.test.ts src/features/portfolio/PortfolioScreen.test.tsx src/features/portfolio/PortfolioDetailScreen.test.tsx
VITE_API_BASE_URL=https://api.iprp.test/api/v1 pnpm --dir frontend build
pnpm --dir backend security:secrets
pnpm --dir backend security:frontend-secrets
git diff --check
```

## Authorized production smoke test

After deployment approval, use separate test-tenant Admin, Attorney, and Viewer accounts. Verify a unique record can be created and edited by Admin/Attorney, read by Viewer, and that every Viewer mutation is 403. Verify the record is absent from a different firm and an arbitrary cross-firm ID is indistinguishable from a nonexistent ID. Do not exercise hard deletion against a record with dependencies. Remove only the unique test record if dependency checks show it is unreferenced and cleanup is separately approved.

## Deployment and rollback

Deploy the backend contract first, confirm readiness and OpenAPI parity, then deploy the frontend. No database migration is required for P2-01. Roll back the frontend to restore the unavailable route if client behavior is defective. If server-side text filtering is defective, roll back the backend artifact; existing portfolio data and schema are unchanged. Do not edit migration `006`, cascade dependencies, or delete production records as rollback actions.
