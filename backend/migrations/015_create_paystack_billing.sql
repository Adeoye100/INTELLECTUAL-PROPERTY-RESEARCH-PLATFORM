-- Paystack billing state is tenant-scoped and server authoritative. Card or
-- bank details are never stored; only provider identifiers and normalized
-- transaction/subscription state are retained.

ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_provider text,
  ADD COLUMN IF NOT EXISTS subscription_code text,
  ADD COLUMN IF NOT EXISTS subscription_customer_code text,
  ADD COLUMN IF NOT EXISTS subscription_renews_at timestamptz;

ALTER TABLE firms DROP CONSTRAINT IF EXISTS firms_subscription_status_valid;
ALTER TABLE firms ADD CONSTRAINT firms_subscription_status_valid CHECK (
  subscription_status IN ('inactive', 'active', 'past_due', 'non_renewing', 'cancelled')
);
ALTER TABLE firms DROP CONSTRAINT IF EXISTS firms_subscription_provider_valid;
ALTER TABLE firms ADD CONSTRAINT firms_subscription_provider_valid CHECK (
  subscription_provider IS NULL OR subscription_provider = 'paystack'
);

CREATE TABLE IF NOT EXISTS billing_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  initiated_by_user_id uuid REFERENCES users(id),
  provider text NOT NULL DEFAULT 'paystack',
  reference text NOT NULL UNIQUE,
  tier text NOT NULL,
  plan_code text NOT NULL,
  amount_subunit bigint NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_transactions_provider_valid CHECK (provider = 'paystack'),
  CONSTRAINT billing_transactions_reference_valid CHECK (reference ~ '^[A-Za-z0-9._=-]{1,100}$'),
  CONSTRAINT billing_transactions_tier_valid CHECK (tier IN ('starter', 'professional')),
  CONSTRAINT billing_transactions_amount_valid CHECK (amount_subunit > 0),
  CONSTRAINT billing_transactions_currency_valid CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT billing_transactions_status_valid CHECK (status IN ('pending', 'paid', 'failed', 'abandoned'))
);
CREATE INDEX IF NOT EXISTS billing_transactions_firm_created_idx
  ON billing_transactions (firm_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS billing_transactions_provider_id_uidx
  ON billing_transactions (provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'paystack',
  payload_digest text NOT NULL UNIQUE,
  event_type text NOT NULL,
  reference text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT billing_webhook_provider_valid CHECK (provider = 'paystack'),
  CONSTRAINT billing_webhook_digest_valid CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT billing_webhook_event_type_valid CHECK (length(event_type) BETWEEN 1 AND 100)
);

ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON billing_transactions, billing_webhook_events FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON billing_transactions, billing_webhook_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON billing_transactions, billing_webhook_events FROM authenticated;
  END IF;
END $$;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
  'portfolio_mark.created', 'portfolio_mark.updated', 'portfolio_mark.deleted',
  'watch.created', 'watch.updated', 'watch.deleted', 'watch.enabled', 'watch.disabled',
  'alert.read', 'alert.dismissed', 'user.role_changed',
  'invitation.issued', 'invitation.resent', 'invitation.revoked', 'invitation.accepted',
  'export.requested', 'export.completed', 'export.failed',
  'office_action_ref.created', 'office_action_ref.updated', 'office_action_ref.deleted',
  'search.executed', 'billing.checkout_initialized', 'billing.payment_confirmed'
));

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_type_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_valid CHECK (entity_type IN (
  'portfolio_mark', 'watch', 'alert', 'user', 'invitation', 'export',
  'office_action_ref', 'search_result', 'billing_transaction'
));
