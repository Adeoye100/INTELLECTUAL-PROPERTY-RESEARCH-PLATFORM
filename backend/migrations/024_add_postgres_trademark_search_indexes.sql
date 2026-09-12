-- The normal API statement timeout is intentionally short. Building search
-- indexes over an existing registry corpus is controlled deployment work and
-- can legitimately take longer, so raise the timeout only for this migration
-- transaction. The migration runner restores the session setting afterwards.
SET LOCAL statement_timeout = '15min';

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

CREATE INDEX IF NOT EXISTS registry_trademarks_mark_text_trgm_idx
  ON registry_trademarks USING gin (mark_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS registry_trademarks_owner_trgm_idx
  ON registry_trademarks USING gin (owner gin_trgm_ops)
  WHERE owner IS NOT NULL;

CREATE INDEX IF NOT EXISTS registry_trademarks_mark_text_fts_idx
  ON registry_trademarks USING gin (to_tsvector('simple', mark_text));

CREATE INDEX IF NOT EXISTS registry_trademarks_nice_classes_gin_idx
  ON registry_trademarks USING gin (nice_classes);

CREATE INDEX IF NOT EXISTS registry_trademarks_filter_idx
  ON registry_trademarks (source_registry, jurisdiction, status, filing_date);

CREATE INDEX IF NOT EXISTS registry_trademarks_soundex_idx
  ON registry_trademarks (soundex(mark_text));
