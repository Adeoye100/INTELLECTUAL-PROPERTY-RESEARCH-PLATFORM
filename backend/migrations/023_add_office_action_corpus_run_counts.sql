-- Migration 023: Add unchanged_count and rejected_count to office_action_corpus_runs

ALTER TABLE office_action_corpus_runs
  ADD COLUMN IF NOT EXISTS unchanged_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_count INTEGER NOT NULL DEFAULT 0;
