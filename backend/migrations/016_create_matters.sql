-- Create Matters and Matter Risk Results for case file management.
-- Tenant isolation is enforced via firm_id on both tables.

CREATE TABLE IF NOT EXISTS matters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  created_by_user_id uuid REFERENCES users(id),
  name text NOT NULL,
  client_ref text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matters_name_valid CHECK (length(trim(name)) >= 1 AND length(name) <= 200),
  CONSTRAINT matters_client_ref_valid CHECK (length(client_ref) <= 100)
);

CREATE INDEX IF NOT EXISTS matters_firm_created_idx
  ON matters (firm_id, created_at DESC);

CREATE TABLE IF NOT EXISTS matter_risk_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES firms(id),
  created_by_user_id uuid REFERENCES users(id),
  search_result_id text,
  candidate_mark_text text NOT NULL,
  risk_score_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matter_risk_results_mark_valid CHECK (length(trim(candidate_mark_text)) >= 1)
);

CREATE INDEX IF NOT EXISTS matter_risk_results_matter_idx
  ON matter_risk_results (matter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS matter_risk_results_firm_idx
  ON matter_risk_results (firm_id, created_at DESC);

ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_risk_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON matters, matter_risk_results FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON matters, matter_risk_results FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON matters, matter_risk_results FROM authenticated;
  END IF;
END $$;
