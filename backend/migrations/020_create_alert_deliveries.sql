-- BE-17: Watch Alert Notifications and Delivery Tracking
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  alert_id uuid NOT NULL REFERENCES alerts(id),
  recipient_email varchar(255) NOT NULL,
  channel varchar(20) NOT NULL CHECK (channel IN ('email', 'in-app')),
  mode varchar(20) NOT NULL CHECK (mode IN ('real-time', 'digest')),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error_code varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_deliveries_firm_id_id_key UNIQUE (firm_id, id),
  CONSTRAINT alert_deliveries_recipient_not_blank CHECK (btrim(recipient_email) <> '')
);

CREATE INDEX IF NOT EXISTS alert_deliveries_pending_idx ON alert_deliveries (status, mode, next_attempt_at) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS alert_deliveries_alert_id_idx ON alert_deliveries (alert_id);
CREATE INDEX IF NOT EXISTS alert_deliveries_firm_recipient_idx ON alert_deliveries (firm_id, recipient_email, mode, status);
