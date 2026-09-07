CREATE TABLE registry_refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_registry varchar(100) NOT NULL,

  status varchar(30) NOT NULL,

  requested_since_date date,

  latest_discovered_source_date date,
  data_through_date date,

  discovered_file_count integer NOT NULL DEFAULT 0,
  processed_record_count integer NOT NULL DEFAULT 0,
  changed_record_count integer NOT NULL DEFAULT 0,
  projected_record_count integer NOT NULL DEFAULT 0,

  projection_backlog_count integer,

  started_at timestamptz NOT NULL DEFAULT now(),
  ingestion_completed_at timestamptz,
  projection_completed_at timestamptz,
  completed_at timestamptz,

  error_code varchar(100),

  CONSTRAINT registry_refresh_status_valid
    CHECK (
      status IN (
        'running',
        'ingested',
        'complete',
        'failed'
      )
    ),

  CONSTRAINT registry_refresh_counts_valid
    CHECK (
      discovered_file_count >= 0
      AND processed_record_count >= 0
      AND changed_record_count >= 0
      AND projected_record_count >= 0
      AND (
        projection_backlog_count IS NULL
        OR projection_backlog_count >= 0
      )
    )
);

CREATE INDEX registry_refresh_source_completed_idx
ON registry_refresh_runs (
  source_registry,
  completed_at DESC
);

CREATE INDEX registry_refresh_source_started_idx
ON registry_refresh_runs (
  source_registry,
  started_at DESC
);

ALTER TABLE search_results
  ADD COLUMN data_through_date date NULL,
  ADD COLUMN source_indexed_at timestamptz NULL,
  ADD COLUMN registry_refresh_run_id uuid NULL REFERENCES registry_refresh_runs(id);
