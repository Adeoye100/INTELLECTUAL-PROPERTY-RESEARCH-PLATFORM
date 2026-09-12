# Live USPTO Search & Watch Activation

## Scope

This release replaces preliminary Search/Watch operation with production data from the official USPTO Open Data Portal bulk Trademark Application XML products. Payment remains unchanged and disabled unless separately activated.

## Authoritative data products

- Annual baseline: `TRTYRAP` (Trademark Application XML annual snapshot).
- Daily incremental feed: `TRTDXFAP` (Trademark Daily XML Applications).
- API base: `https://api.uspto.gov/api/v1/datasets/products`.
- Authentication: server-side `USPTO_ODP_API_KEY`; never expose this value to the frontend or logs.

The first production refresh loads the latest complete annual snapshot and then all daily application files newer than that snapshot cutoff. Later refreshes replay from the previous complete `dataThroughDate` minus the configured overlap window. All imports remain idempotent on `(source_registry, source_reference_id)`.

## Activation order

1. Configure the backend refresh environment with `USPTO_BULK_SOURCE=odp`, `USPTO_ODP_API_KEY`, `ELASTICSEARCH_URL`, and the existing production `DATABASE_URL`.
2. Run `pnpm refresh:uspto-search` once with no `--since` value. The absence of a complete prior run now triggers the official annual-baseline-plus-daily flow.
3. Require a completed refresh ledger entry, non-zero normalized USPTO records, zero Elasticsearch projection backlog, and freshness state `ready`.
4. Enable backend `SEARCH_ENABLED=true` and deploy. Verify authenticated live Search returns USPTO-attributed results plus `dataFreshness`.
5. Enable frontend live Search only after the backend smoke test succeeds.
6. Enable `WATCH_ENABLED=true` only after Search is live and fresh. Start the production watch worker with the same database, Redis, Search, Elasticsearch and mailer configuration as the API.
7. Verify a watch can be created, persisted, scheduled, polled against the live USPTO-backed search corpus, and can generate a firm-scoped in-app alert. Email delivery is accepted only after a real provider delivery is observed.

## Required stop conditions

Do not enable Search if the ODP manifest/download fails, baseline is incomplete, Elasticsearch is unreachable, projection backlog is non-zero, or freshness is stale. Do not enable Watches if Search is not `ready`, Redis is unavailable, or the watch worker is not running. Never substitute mock, portfolio-only, manually entered, or fabricated registry data for these production checks.

## Office Actions and Reports

Risk Analysis becomes production-backed automatically when it is entered from a persisted live Search result, because the existing server-side risk enrichment consumes that authoritative candidate evidence.

Office Action automated corpus research has a separate trademark-source prerequisite and must not be represented as live merely because Search is live. Manual verified-reference intake remains valid until its authorized corpus/source gate is independently satisfied.

Queued PDF reports have a separate worker/storage gate. Browser-printable summaries do not prove the production PDF worker is active.
