# PDF report integration boundary

FE-17 provides one accessible export component for search results, risk detail, and portfolio summary screens. Each trigger sends a typed report type plus the current screen context to `POST /api/reports/pdf` and handles disabled, loading, success/download, retry, and failure states.

Real PDF generation is backend-blocked. The development-only MSW handler in `src/lib/mocks/handlers.ts` returns a small download fixture solely while the endpoint is unavailable and must be removed when the real service lands.

The backend remains required to:

- authenticate the request and authorize the user against the report's firm, matter, search, result, and portfolio records;
- regenerate report data from authoritative stored records rather than trusting IDs or display values supplied by the browser;
- generate, encrypt, retain, and expire the PDF according to the agreed data-handling policy;
- return either an `application/pdf` response or a short-lived authorized download URL and filename; and
- write an `export.generate` audit event without leaking cross-tenant report existence.

Frontend route guards and the temporary MSW response do not provide report authorization.
