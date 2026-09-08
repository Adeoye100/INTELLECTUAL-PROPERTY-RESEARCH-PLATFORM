-- Migration 021: Create Office Action Documents, Ingestion Corpus Tracking, and Matter Precedent Links

CREATE TABLE IF NOT EXISTS office_action_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_registry VARCHAR(100) NOT NULL,
  source_reference_id VARCHAR(200) NOT NULL,
  application_number VARCHAR(100),
  mark_text VARCHAR(200),
  owner VARCHAR(200),
  jurisdiction VARCHAR(20),
  document_type VARCHAR(80) NOT NULL,
  office_action_date DATE,
  examiner_name VARCHAR(200),
  examiner_reasoning_text TEXT,
  summary_method VARCHAR(20) NOT NULL DEFAULT 'registry',
  source_document_url TEXT,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_published_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_office_action_docs_source UNIQUE (source_registry, source_reference_id)
);

CREATE INDEX IF NOT EXISTS idx_office_action_docs_lookup
  ON office_action_documents (source_registry, office_action_date DESC);

CREATE INDEX IF NOT EXISTS idx_office_action_docs_app_num
  ON office_action_documents (application_number);

CREATE INDEX IF NOT EXISTS idx_office_action_docs_mark_text
  ON office_action_documents (mark_text);

CREATE TABLE IF NOT EXISTS office_action_corpus_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_registry VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  data_through DATE,
  processed_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  error_code VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS matter_office_action_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  office_action_ref_id UUID NOT NULL REFERENCES office_action_refs(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_matter_oa_refs UNIQUE (firm_id, matter_id, office_action_ref_id)
);

CREATE INDEX IF NOT EXISTS idx_matter_oa_refs_lookup
  ON matter_office_action_refs (firm_id, matter_id);
