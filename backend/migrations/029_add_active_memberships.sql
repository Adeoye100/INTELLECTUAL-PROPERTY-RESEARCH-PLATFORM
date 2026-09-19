-- Firm seat removal must preserve historical foreign-key references and audit
-- records. Model membership state explicitly rather than deleting user rows.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS users_firm_active_idx
  ON users (firm_id, active, role);

-- Extend the immutable audit allow-list for membership deactivation/reactivation.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
  'portfolio_mark.created', 'portfolio_mark.updated', 'portfolio_mark.deleted',
  'watch.created', 'watch.updated', 'watch.deleted', 'watch.enabled', 'watch.disabled',
  'alert.read', 'alert.dismissed',
  'user.role_changed', 'user.deactivated', 'user.reactivated',
  'invitation.issued', 'invitation.resent', 'invitation.revoked', 'invitation.accepted',
  'export.requested', 'export.completed', 'export.failed',
  'office_action_ref.created', 'office_action_ref.updated', 'office_action_ref.deleted',
  'search.executed',
  'billing.checkout_initialized', 'billing.payment_confirmed'
));
