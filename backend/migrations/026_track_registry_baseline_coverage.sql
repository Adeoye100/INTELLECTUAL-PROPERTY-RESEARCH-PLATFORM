ALTER TABLE registry_refresh_runs
  ADD COLUMN coverage_kind varchar(20) NOT NULL DEFAULT 'incremental',
  ADD COLUMN source_release varchar(255),
  ADD COLUMN expected_file_count integer;

ALTER TABLE registry_refresh_runs
  ADD CONSTRAINT registry_refresh_coverage_kind_valid
    CHECK (coverage_kind IN ('incremental', 'baseline')),
  ADD CONSTRAINT registry_refresh_expected_file_count_valid
    CHECK (expected_file_count IS NULL OR expected_file_count > 0);

CREATE INDEX registry_refresh_complete_baseline_idx
ON registry_refresh_runs (source_registry, completed_at DESC)
WHERE status = 'complete' AND coverage_kind = 'baseline';
