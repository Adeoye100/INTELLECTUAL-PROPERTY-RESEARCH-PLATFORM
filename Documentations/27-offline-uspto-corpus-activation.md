# Offline USPTO corpus activation

## Why production Search currently fails closed

Production Search uses `SEARCH_BACKEND=postgres` and reads the canonical `registry_trademarks` table. If the table contains no USPTO rows, the API returns `503 SEARCH_CORPUS_EMPTY`. This is intentional: the application must never substitute fixtures, stale browser data, or fabricated registry records.

The same rule applies to Office Action research. `office_action_documents` must contain provenance-preserving records before Office Action search can return a result set.

## Keyless trademark bulk import

The repository supports importing an official USPTO Trademark Applications bulk XML file that has already been obtained through an authorized USPTO download/account workflow. The import performs no request-time USPTO network call and needs no USPTO API key.

```bash
cd backend
DATABASE_URL='postgresql://...' DATABASE_SSL=true \
  pnpm import:uspto-bulk -- --input /secure/path/to/official-uspto-file.zip
```

`.xml` and `.zip` inputs are accepted. The command:

- uses the existing USPTO Trademark Applications XML parser;
- writes only normalized `USPTO` records;
- uses idempotent `(source_registry, source_reference_id)` upserts;
- records an auditable `registry_refresh_runs` entry;
- records the source `dataThroughDate` from parsed USPTO transaction dates;
- never projects to or depends on Elasticsearch when production Search is configured for PostgreSQL.

After import, verify with a read-only query:

```sql
select count(*) as records, max(source_updated_at) as data_through
from registry_trademarks
where source_registry = 'USPTO';
```

Production Search is acceptable only when `records > 0` and the displayed data-through date matches the corpus actually imported.

## Office Action corpus import

Office Action ingestion remains file-driven when no authorized live USPTO API credential is configured:

```bash
cd backend
DATABASE_URL='postgresql://...' DATABASE_SSL=true \
  pnpm ingest:office-actions -- --input /secure/path/to/official-office-actions.ndjson
```

Input must be derived from an authorized official USPTO Office Action source and conform to the existing ingestion contract. The importer validates provenance fields, document type, dates, URLs, and plain-text examiner reasoning, performs idempotent persistence, and records `office_action_corpus_runs` evidence.

Verify:

```sql
select count(*) as records, max(source_updated_at) as data_through
from office_action_documents
where source_registry = 'USPTO';
```

Do not enable or describe Office Action search as current/live when the corpus is empty or its provenance/date cannot be established.

## USPTO access constraint

As of 2026, USPTO Open Data Portal access requires a USPTO.gov account and its API endpoints document API-key requirements. This repository therefore does not attempt to bypass registration, authentication, API keys, rate limits, or access controls. Under a strict no-API-key policy, official bulk files must be obtained through an authorized account/download workflow and imported with the commands above.

## Acceptance sequence

1. Obtain the official bulk file through an authorized USPTO workflow.
2. Import it into the production Supabase/PostgreSQL database.
3. Verify non-zero row count and source date.
4. Run an authenticated Search query against a known mark and confirm the returned source is `USPTO` and `dataFreshness.dataThrough` matches the imported corpus.
5. Open Risk Analysis from a persisted search result and verify the server-produced evidence/methodology is shown.
6. Import an official Office Action corpus, verify non-zero rows, and run a controlled Office Action query.
7. Generate a PDF using the backend export worker and download it through the authenticated export route. No browser print/save fallback is acceptable.
