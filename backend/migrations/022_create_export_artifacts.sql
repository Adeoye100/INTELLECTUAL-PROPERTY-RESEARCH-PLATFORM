-- Migration 022: Create Export Artifacts for PostgreSQL-backed PDF storage
CREATE TABLE IF NOT EXISTS export_artifacts (
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  export_id UUID NOT NULL REFERENCES exports(id) ON DELETE CASCADE,
  storage_key VARCHAR(512) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  byte_size INTEGER NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  body BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_export_artifacts PRIMARY KEY (firm_id, export_id),
  CONSTRAINT chk_export_artifacts_byte_size CHECK (byte_size > 0),
  CONSTRAINT chk_export_artifacts_checksum CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$')
);

ALTER TABLE export_artifacts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_export_artifacts_storage_key ON export_artifacts (storage_key);
