# PDF Export Feature & API Integration

`frontend/src/features/reports` provides the `PdfExport` component and `reportsApi` integration for asynchronous PDF export generation across Search Results, Risk Detail, and Portfolio Summary screens.

## Async Export Workflow

1. **Job Enqueue**: Initial export triggers a `POST /api/v1/exports` request with an idempotency key (`pdf:<uuid>`), report type (`search_results`, `risk_report`, or `portfolio_summary`), and context parameters.
2. **Polling Resumption**: The client polls `GET /api/v1/exports/:id` until `status` becomes `completed` or `failed`. If polling times out or encounters network interruption, retry reuses the existing `exportId` or idempotency key. Explicit regeneration creates a fresh idempotency key.
3. **Authenticated Download**: Once completed, the client downloads the PDF via `GET /api/v1/exports/:id/download` and revokes the temporary object URL on unmount.

## Security & Capability Gating

- **Capability**: Required capability is `"reports:export"` (Admin & Attorney = true, Viewer = false).
- **Feature Flag**: `features.pdfExportEnabled` must be enabled.
- **Tenant Isolation**: Backend enforces firm-scoped isolation. Cross-tenant export requests return 404 `EXPORT_JOB_NOT_FOUND`.
- **Data Provenance**: Report document models preserve historical `dataFreshness` stored in persisted search snapshots without performing Elasticsearch or registry queries during export.

