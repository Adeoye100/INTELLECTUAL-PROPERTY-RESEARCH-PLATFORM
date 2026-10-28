ALTER TABLE registry_refresh_runs
  ADD COLUMN retained_record_count integer NOT NULL DEFAULT 0;

ALTER TABLE registry_refresh_runs
  ADD CONSTRAINT registry_refresh_retained_count_valid
  CHECK (retained_record_count >= 0);
