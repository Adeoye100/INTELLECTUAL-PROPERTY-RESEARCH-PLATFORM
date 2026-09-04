-- Add portfolio mark status history and attachment persistence tables.

CREATE TABLE IF NOT EXISTS portfolio_mark_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_mark_id uuid NOT NULL REFERENCES portfolio_marks(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES firms(id),
  status text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_history_status_valid CHECK (
    status IN ('pending', 'filed', 'registered', 'abandoned', 'expired', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS portfolio_status_history_mark_idx
  ON portfolio_mark_status_history (portfolio_mark_id, effective_at DESC);

CREATE INDEX IF NOT EXISTS portfolio_status_history_firm_idx
  ON portfolio_mark_status_history (firm_id, effective_at DESC);

CREATE TABLE IF NOT EXISTS portfolio_mark_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_mark_id uuid NOT NULL REFERENCES portfolio_marks(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES firms(id),
  uploaded_by_user_id uuid REFERENCES users(id),
  file_name text NOT NULL,
  content_type text NOT NULL,
  availability text NOT NULL DEFAULT 'available',
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachment_availability_valid CHECK (availability IN ('available', 'unavailable'))
);

CREATE INDEX IF NOT EXISTS portfolio_attachments_mark_idx
  ON portfolio_mark_attachments (portfolio_mark_id, created_at DESC);

CREATE INDEX IF NOT EXISTS portfolio_attachments_firm_idx
  ON portfolio_mark_attachments (firm_id, created_at DESC);

ALTER TABLE portfolio_mark_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_mark_attachments ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON portfolio_mark_status_history, portfolio_mark_attachments FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON portfolio_mark_status_history, portfolio_mark_attachments FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON portfolio_mark_status_history, portfolio_mark_attachments FROM authenticated;
  END IF;
END $$;
