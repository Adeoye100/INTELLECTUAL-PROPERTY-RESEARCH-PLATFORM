-- BE-20: asynchronous, firm-scoped PDF export lifecycle records. PDF bytes
-- and signed URLs are deliberately never stored in PostgreSQL.
CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  requested_by_user_id uuid NOT NULL REFERENCES users(id),
  export_type varchar(40) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'queued',
  source_entity_id uuid NOT NULL,
  request_id varchar(128) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_key varchar(512),
  mime_type varchar(100),
  byte_size integer,
  checksum_sha256 varchar(64),
  failure_code varchar(100),
  queued_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exports_type_valid CHECK (export_type IN ('search_results', 'risk_report', 'portfolio_summary')),
  CONSTRAINT exports_status_valid CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  CONSTRAINT exports_request_id_not_blank CHECK (btrim(request_id) <> ''),
  CONSTRAINT exports_idempotency_key_not_blank CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT exports_parameters_object CHECK (jsonb_typeof(parameters) = 'object'),
  CONSTRAINT exports_byte_size_nonnegative CHECK (byte_size IS NULL OR byte_size >= 0),
  CONSTRAINT exports_checksum_sha256_valid CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT exports_failure_code_valid CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z0-9_]+$'),
  CONSTRAINT exports_completed_state_consistent CHECK (
    (status <> 'completed') OR (
      storage_key IS NOT NULL AND mime_type = 'application/pdf' AND byte_size IS NOT NULL
      AND checksum_sha256 IS NOT NULL AND completed_at IS NOT NULL AND failed_at IS NULL AND failure_code IS NULL
    )
  ),
  CONSTRAINT exports_failed_state_consistent CHECK (
    (status <> 'failed') OR (
      failure_code IS NOT NULL AND failed_at IS NOT NULL AND completed_at IS NULL
      AND storage_key IS NULL AND mime_type IS NULL AND byte_size IS NULL AND checksum_sha256 IS NULL
    )
  ),
  CONSTRAINT exports_queued_processing_state_consistent CHECK (
    status NOT IN ('queued', 'processing') OR (
      storage_key IS NULL AND mime_type IS NULL AND byte_size IS NULL AND checksum_sha256 IS NULL
      AND completed_at IS NULL AND failed_at IS NULL AND failure_code IS NULL
    )
  ),
  CONSTRAINT exports_firm_idempotency_key UNIQUE (firm_id, idempotency_key)
);

-- These additive clauses make a repeat after an interrupted/manual provision
-- safe without attempting to rewrite existing rows.
ALTER TABLE exports ADD COLUMN IF NOT EXISTS firm_id uuid;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS requested_by_user_id uuid;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS export_type varchar(40);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS status varchar(20);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS source_entity_id uuid;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS request_id varchar(128);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS idempotency_key varchar(128);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS parameters jsonb DEFAULT '{}'::jsonb;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS storage_key varchar(512);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS mime_type varchar(100);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS byte_size integer;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS checksum_sha256 varchar(64);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS failure_code varchar(100);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS queued_at timestamptz;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE exports ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS exports_firm_status_created_id_idx
  ON exports (firm_id, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS exports_firm_requester_created_id_idx
  ON exports (firm_id, requested_by_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS exports_firm_source_entity_idx
  ON exports (firm_id, source_entity_id, created_at DESC, id DESC);
-- The unique firm/idempotency constraint supplies the lookup index required
-- for idempotent POST retries.
