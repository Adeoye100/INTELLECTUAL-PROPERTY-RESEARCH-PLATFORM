-- Tenant-safe organization creation and invitation lifecycle. This migration is
-- additive: it neither modifies an applied migration nor performs production
-- tenant cleanup.

ALTER TABLE firm_invitations
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES firm_invitations(id),
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

ALTER TABLE firm_invitations
  DROP CONSTRAINT IF EXISTS firm_invitations_token_hash_format;
ALTER TABLE firm_invitations
  ADD CONSTRAINT firm_invitations_token_hash_format
  CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$');

-- Old invitations were allowed to overlap. Keep the newest pending record and
-- mark the older records unavailable before enforcing the new invariant.
WITH duplicate_pending AS (
  SELECT id, row_number() OVER (
    PARTITION BY firm_id, email
    ORDER BY created_at DESC, id DESC
  ) AS row_number
  FROM firm_invitations
  WHERE used_at IS NULL AND revoked_at IS NULL AND superseded_by IS NULL
)
UPDATE firm_invitations invitation
SET revoked_at = now()
FROM duplicate_pending duplicate
WHERE invitation.id = duplicate.id AND duplicate.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS firm_invitations_pending_firm_email_uidx
  ON firm_invitations (firm_id, email)
  WHERE used_at IS NULL AND revoked_at IS NULL AND superseded_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS firm_invitations_token_hash_uidx
  ON firm_invitations (token_hash)
  WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS firm_invitations_firm_created_idx
  ON firm_invitations (firm_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS firm_invitations_superseded_by_idx
  ON firm_invitations (superseded_by)
  WHERE superseded_by IS NOT NULL;

-- The browser may hold only an opaque, short-lived creation-intent token. The
-- server stores its digest and remains authoritative for firm name and email.
CREATE TABLE IF NOT EXISTS organization_provisioning_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  email text NOT NULL,
  firm_name text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_provisioning_intents_token_hash_format
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT organization_provisioning_intents_email_normalized
    CHECK (email = lower(btrim(email))),
  CONSTRAINT organization_provisioning_intents_firm_name_nonempty
    CHECK (length(btrim(firm_name)) >= 2),
  CONSTRAINT organization_provisioning_intents_expiry_after_creation
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS organization_provisioning_intents_email_idx
  ON organization_provisioning_intents (email, expires_at DESC);

ALTER TABLE organization_provisioning_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON organization_provisioning_intents FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON organization_provisioning_intents FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON organization_provisioning_intents FROM authenticated;
  END IF;
END $$;

-- BE-16 originally froze the action/type checks before invitation management
-- existed. Extend those checks here, never by editing migration 009.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
  'portfolio_mark.created', 'portfolio_mark.updated', 'portfolio_mark.deleted',
  'watch.created', 'watch.updated', 'watch.deleted', 'watch.enabled', 'watch.disabled',
  'alert.read', 'alert.dismissed',
  'user.role_changed',
  'invitation.issued', 'invitation.resent', 'invitation.revoked', 'invitation.accepted',
  'export.requested', 'export.completed', 'export.failed'
));

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_type_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_valid CHECK (entity_type IN (
  'portfolio_mark', 'watch', 'alert', 'user', 'invitation', 'export'
));
