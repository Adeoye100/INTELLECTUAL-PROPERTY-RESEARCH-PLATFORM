-- BE-12: additive, tenant-scoped polling watches. No alert or subscription
-- tables are created by this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'portfolio_marks'::regclass
      AND conname = 'portfolio_marks_firm_id_id_key'
  ) THEN
    ALTER TABLE portfolio_marks
      ADD CONSTRAINT portfolio_marks_firm_id_id_key UNIQUE (firm_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  portfolio_mark_id uuid NOT NULL,
  owner_user_id uuid REFERENCES users(id),
  state varchar(10) NOT NULL DEFAULT 'enabled',
  poll_interval_minutes integer NOT NULL,
  next_poll_at timestamptz,
  last_polled_at timestamptz,
  last_poll_status varchar(12),
  last_error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watches_portfolio_mark_firm_key FOREIGN KEY (firm_id, portfolio_mark_id)
    REFERENCES portfolio_marks(firm_id, id),
  CONSTRAINT watches_state_valid CHECK (state IN ('enabled', 'paused')),
  CONSTRAINT watches_poll_interval_valid CHECK (poll_interval_minutes BETWEEN 5 AND 43200),
  CONSTRAINT watches_last_poll_status_valid CHECK (
    last_poll_status IS NULL OR last_poll_status IN ('completed', 'partial', 'failed')
  ),
  CONSTRAINT watches_last_error_code_sanitized CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[A-Z0-9_]{1,80}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS watches_one_enabled_per_mark_uidx
  ON watches (firm_id, portfolio_mark_id) WHERE state = 'enabled';
CREATE INDEX IF NOT EXISTS watches_firm_id_idx ON watches (firm_id);
CREATE INDEX IF NOT EXISTS watches_portfolio_mark_id_idx ON watches (portfolio_mark_id);
CREATE INDEX IF NOT EXISTS watches_due_idx
  ON watches (next_poll_at, id) WHERE state = 'enabled' AND next_poll_at IS NOT NULL;
