-- BE-13: immutable watch-poll evidence and firm-scoped alert state. This is
-- additive only; it neither delivers notifications nor creates subscriptions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'watches'::regclass AND conname = 'watches_firm_id_id_key'
  ) THEN
    ALTER TABLE watches ADD CONSTRAINT watches_firm_id_id_key UNIQUE (firm_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  watch_id uuid NOT NULL,
  portfolio_mark_id uuid NOT NULL,
  candidate_source varchar(100) NOT NULL,
  candidate_registry_reference varchar(200) NOT NULL,
  candidate_mark_text varchar(200) NOT NULL,
  visual_score numeric(5,2) NOT NULL,
  phonetic_score numeric(5,2) NOT NULL,
  class_overlap_score numeric(5,2) NOT NULL,
  composite_score numeric(5,2) NOT NULL,
  conceptual_score numeric(5,2),
  composite_rating varchar(10) NOT NULL,
  methodology_version varchar(100) NOT NULL,
  matched_mark_refs jsonb NOT NULL,
  source_request_id varchar(100) NOT NULL,
  source_statuses jsonb NOT NULL,
  source_partial boolean NOT NULL,
  observed_at timestamptz NOT NULL,
  fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_scores_watch_firm_key FOREIGN KEY (firm_id, watch_id)
    REFERENCES watches(firm_id, id),
  CONSTRAINT risk_scores_portfolio_mark_firm_key FOREIGN KEY (firm_id, portfolio_mark_id)
    REFERENCES portfolio_marks(firm_id, id),
  CONSTRAINT risk_scores_visual_bound CHECK (visual_score BETWEEN 0 AND 100),
  CONSTRAINT risk_scores_phonetic_bound CHECK (phonetic_score BETWEEN 0 AND 100),
  CONSTRAINT risk_scores_class_overlap_bound CHECK (class_overlap_score BETWEEN 0 AND 100),
  CONSTRAINT risk_scores_composite_bound CHECK (composite_score BETWEEN 0 AND 100),
  CONSTRAINT risk_scores_conceptual_bound CHECK (conceptual_score IS NULL OR conceptual_score BETWEEN 0 AND 100),
  CONSTRAINT risk_scores_rating_valid CHECK (composite_rating IN ('low', 'medium', 'high')),
  CONSTRAINT risk_scores_source_not_blank CHECK (btrim(candidate_source) <> ''),
  CONSTRAINT risk_scores_reference_not_blank CHECK (btrim(candidate_registry_reference) <> ''),
  CONSTRAINT risk_scores_mark_not_blank CHECK (btrim(candidate_mark_text) <> ''),
  CONSTRAINT risk_scores_fingerprint_valid CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT risk_scores_watch_fingerprint_key UNIQUE (firm_id, watch_id, fingerprint),
  CONSTRAINT risk_scores_firm_id_id_key UNIQUE (firm_id, id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  watch_id uuid NOT NULL,
  portfolio_mark_id uuid NOT NULL,
  risk_score_id uuid NOT NULL,
  severity varchar(10) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'unread',
  policy_version varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alerts_watch_firm_key FOREIGN KEY (firm_id, watch_id)
    REFERENCES watches(firm_id, id),
  CONSTRAINT alerts_portfolio_mark_firm_key FOREIGN KEY (firm_id, portfolio_mark_id)
    REFERENCES portfolio_marks(firm_id, id),
  CONSTRAINT alerts_risk_score_firm_key FOREIGN KEY (firm_id, risk_score_id)
    REFERENCES risk_scores(firm_id, id),
  CONSTRAINT alerts_one_per_risk_score_key UNIQUE (risk_score_id),
  CONSTRAINT alerts_severity_valid CHECK (severity IN ('medium', 'high')),
  CONSTRAINT alerts_status_valid CHECK (status IN ('unread', 'read', 'dismissed')),
  CONSTRAINT alerts_read_state_valid CHECK (
    (status <> 'read' OR read_at IS NOT NULL)
    AND (read_at IS NULL OR status IN ('read', 'dismissed'))
  ),
  CONSTRAINT alerts_dismissed_state_valid CHECK (
    (status <> 'dismissed' OR dismissed_at IS NOT NULL)
    AND (dismissed_at IS NULL OR status = 'dismissed')
  )
);

CREATE INDEX IF NOT EXISTS risk_scores_watch_id_idx ON risk_scores (watch_id);
CREATE INDEX IF NOT EXISTS risk_scores_portfolio_mark_id_idx ON risk_scores (portfolio_mark_id);
CREATE INDEX IF NOT EXISTS alerts_firm_status_created_idx ON alerts (firm_id, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS alerts_watch_id_idx ON alerts (watch_id);
CREATE INDEX IF NOT EXISTS alerts_portfolio_mark_id_idx ON alerts (portfolio_mark_id);
CREATE INDEX IF NOT EXISTS alerts_risk_score_id_idx ON alerts (risk_score_id);
