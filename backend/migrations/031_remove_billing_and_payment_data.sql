-- Remove the retired financial subsystem and all retained provider state.
-- This migration is intentionally destructive because payment processing is no
-- longer part of the product. Core PostgreSQL transactions remain untouched.

DELETE FROM audit_logs
WHERE action IN ('billing.checkout_initialized', 'billing.payment_confirmed')
   OR entity_type = 'billing_transaction';

DROP TABLE IF EXISTS billing_webhook_events;
DROP TABLE IF EXISTS billing_transactions;

ALTER TABLE firms
  DROP COLUMN IF EXISTS subscription_tier,
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS subscription_provider,
  DROP COLUMN IF EXISTS subscription_code,
  DROP COLUMN IF EXISTS subscription_customer_code,
  DROP COLUMN IF EXISTS subscription_renews_at;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
  'portfolio_mark.created', 'portfolio_mark.updated', 'portfolio_mark.deleted',
  'watch.created', 'watch.updated', 'watch.deleted', 'watch.enabled', 'watch.disabled',
  'alert.read', 'alert.dismissed',
  'user.role_changed', 'user.deactivated', 'user.reactivated',
  'invitation.issued', 'invitation.resent', 'invitation.revoked', 'invitation.accepted',
  'export.requested', 'export.completed', 'export.failed',
  'office_action_ref.created', 'office_action_ref.updated', 'office_action_ref.deleted',
  'search.executed'
));

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_type_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_valid CHECK (entity_type IN (
  'portfolio_mark', 'watch', 'alert', 'user', 'invitation', 'export',
  'office_action_ref', 'search_result'
));
