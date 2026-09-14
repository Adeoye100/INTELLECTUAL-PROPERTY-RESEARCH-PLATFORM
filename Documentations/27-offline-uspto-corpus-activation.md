# Offline USPTO corpus activation

## Why production Search currently fails closed

Production Search uses `SEARCH_BACKEND=postgres` and reads the canonical `registry_trademarks` table. Search becomes ready only when two conditions are true: the USPTO corpus contains normalized rows and a completed **baseline** `registry_refresh_runs` record proves that a full historical snapshot finished successfully. A completed daily/incremental import alone is not sufficient. If either condition is missing, the API returns `503 SEARCH_CORPUS_UNAVAILABLE`.

This is intentional: the application must never substitute fixtures, partially imported rows, stale browser data, or fabricated registry records.

The same rule applies to Office Action research. `office_action_documents` must contain provenance-preserving records before Office Action search can return a result set.

## Public USPTO Trademark Applications bulk data

The USPTO Trademark Applications XML products are public government data. IPRP does not require a USPTO API key to parse and query bulk files that have already been obtained from an authorized public download location or a provenance-preserving public mirror of the original USPTO files.

The annual product is a multipart historical snapshot with names such as:

```text
apc18840407-20251231-01.zip
apc18840407-20251231-02.zip
...
```

Daily/front-file updates use names such as:

```text
apc260901.zip
apc260902.zip
```

Do not treat one annual part as a complete corpus. Annual parts are serial-number partitions of one snapshot.

## Import a complete annual baseline

Place every part from one annual release in a dedicated directory. Determine the expected part count from that release's published listing/manifest, then run:

```bash
cd backend
DATABASE_URL='postgresql://...' DATABASE_SSL=true \
  pnpm import:uspto-bulk -- \
  --input-dir /secure/path/to/apc18840407-20251231 \
  --expected-parts <release-part-count>
```

Before any database write, the importer verifies that:

- every file follows `apcSTART-END-PART.zip` or `.xml` naming;
- every file belongs to the same release;
- part numbers are unique;
- every part from `1` through `expected-parts` is present;
- no unexpected part exists.

Only after the entire verified set parses successfully is the refresh ledger marked `coverage_kind='baseline'` and `status='complete'`. If an import fails midway, already-upserted rows remain idempotently reusable on retry, but Search remains fail-closed because no completed baseline exists.

The importer streams XML rather than materializing the annual files in memory and enforces bounded input/XML sizes.

## Import daily updates after the baseline

After a baseline is complete, replay newer official daily files individually:

```bash
cd backend
DATABASE_URL='postgresql://...' DATABASE_SSL=true \
  pnpm import:uspto-bulk -- --input /secure/path/to/apcYYMMDD.zip
```

Daily imports are recorded as `coverage_kind='incremental'`. They can advance the corpus `dataThrough` evidence but can never establish baseline completeness by themselves.

## What the importer persists

Both paths:

- use the existing USPTO Trademark Applications XML v2.0 parser;
- write only normalized `USPTO` records;
- use idempotent `(source_registry, source_reference_id)` upserts;
- record an auditable `registry_refresh_runs` entry;
- preserve baseline/incremental coverage type and source release metadata;
- record expected/discovered file counts;
- record source `dataThroughDate` from parsed USPTO transaction dates;
- never require Elasticsearch when production Search uses PostgreSQL.

Verify with read-only queries:

```sql
select count(*) as records, max(source_updated_at) as data_through
from registry_trademarks
where source_registry = 'USPTO';

select
  id,
  status,
  coverage_kind,
  source_release,
  expected_file_count,
  discovered_file_count,
  data_through_date,
  processed_record_count,
  completed_at
from registry_refresh_runs
where source_registry = 'USPTO'
order by started_at desc
limit 10;
```

Production Search is acceptable only when `records > 0` and at least one `status='complete' AND coverage_kind='baseline'` run exists for the corpus lineage being served.

## Office Action corpus import

Office Action ingestion is a separate dataset from the Trademark Applications case-file corpus and from TTAB proceedings. Do not map TTAB records into `office_action_documents` merely to make Office Action search non-empty.

When a genuine USPTO Office Action bulk source has been obtained in the existing ingestion format:

```bash
cd backend
DATABASE_URL='postgresql://...' DATABASE_SSL=true \
  pnpm ingest:office-actions -- --input /secure/path/to/official-office-actions.ndjson
```

The importer validates provenance fields, document type, dates, URLs, and plain-text examiner reasoning, performs idempotent persistence, and records `office_action_corpus_runs` evidence.

Verify:

```sql
select count(*) as records, max(source_updated_at) as data_through
from office_action_documents
where source_registry = 'USPTO';
```

Do not describe Office Action search as current/live when the corpus is empty or its provenance/date cannot be established.

## Acceptance sequence

1. Obtain every file in one public USPTO annual Trademark Applications snapshot.
2. Validate the release part count and import the full multipart baseline into production Supabase/PostgreSQL.
3. Verify non-zero row count and a completed baseline ledger.
4. Replay daily files newer than the baseline snapshot as incremental imports.
5. Run authenticated Search against known marks and verify the source is `USPTO`, results come from PostgreSQL, and `dataFreshness.dataThrough` matches the imported corpus.
6. Open Risk Analysis from a persisted search result and verify the server-produced evidence/methodology and live-corpus conflict result.
7. Load a genuine USPTO Office Action corpus separately and run a controlled Office Action query.
8. Generate a PDF using the backend export worker and download it through the authenticated export route. No browser print/save fallback is acceptable.
