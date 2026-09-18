-- Keep case-insensitive exact mark lookup index-backed on the production corpus.
-- The source registry prefix matches the mandatory search source filter, while
-- source_updated_at preserves the exact-match branch's requested ordering.
SET LOCAL statement_timeout = '15min';

CREATE INDEX IF NOT EXISTS registry_trademarks_source_lower_mark_updated_idx
  ON registry_trademarks (source_registry, lower(mark_text), source_updated_at DESC NULLS LAST);

-- A live GiST trigram experiment proved slower than the existing GIN index for
-- this corpus and adds substantial cache/storage pressure. It was never part of
-- the application contract; remove it if present and keep GIN as fuzzy fallback.
DROP INDEX IF EXISTS registry_trademarks_mark_text_gist_trgm_idx;
