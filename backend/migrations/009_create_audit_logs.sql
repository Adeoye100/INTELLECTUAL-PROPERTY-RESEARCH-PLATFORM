-- BE-16: immutable, tenant-scoped records of sensitive server-side actions.
-- This migration is additive and safe to re-run against a partially provisioned
-- database. PostgreSQL timestamptz values are stored in UTC.
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  action varchar(80) NOT NULL,
  entity_type varchar(40) NOT NULL,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id varchar(128),
  ip_address varchar(64),
  user_agent varchar(512),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_format_valid CHECK (action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  CONSTRAINT audit_logs_action_valid CHECK (action IN (
    'portfolio_mark.created', 'portfolio_mark.updated', 'portfolio_mark.deleted',
    'watch.created', 'watch.updated', 'watch.deleted', 'watch.enabled', 'watch.disabled',
    'alert.read', 'alert.dismissed',
    'user.role_changed',
    'export.requested', 'export.completed', 'export.failed'
  )),
  CONSTRAINT audit_logs_entity_type_valid CHECK (entity_type IN (
    'portfolio_mark', 'watch', 'alert', 'user', 'export'
  )),
  CONSTRAINT audit_logs_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT audit_logs_before_state_object CHECK (
    before_state IS NULL OR jsonb_typeof(before_state) = 'object'
  ),
  CONSTRAINT audit_logs_after_state_object CHECK (
    after_state IS NULL OR jsonb_typeof(after_state) = 'object'
  ),
  CONSTRAINT audit_logs_has_auditable_data CHECK (
    before_state IS NOT NULL OR after_state IS NOT NULL OR metadata <> '{}'::jsonb
  )
);

-- A re-run may find a table made by an interrupted/manual deployment. Add the
-- named checks individually without changing an already valid schema.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOREACH constraint_name IN ARRAY ARRAY[
    'audit_logs_action_format_valid', 'audit_logs_action_valid',
    'audit_logs_entity_type_valid', 'audit_logs_metadata_object',
    'audit_logs_before_state_object', 'audit_logs_after_state_object',
    'audit_logs_has_auditable_data'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'audit_logs'::regclass AND conname = constraint_name
    ) THEN
      CASE constraint_name
        WHEN 'audit_logs_action_format_valid' THEN
          ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_format_valid
            CHECK (action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$');
        WHEN 'audit_logs_action_valid' THEN
          ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
            'portfolio_mark.created', 'portfolio_mark.updated', 'portfolio_mark.deleted',
            'watch.created', 'watch.updated', 'watch.deleted', 'watch.enabled', 'watch.disabled',
            'alert.read', 'alert.dismissed', 'user.role_changed',
            'export.requested', 'export.completed', 'export.failed'
          ));
        WHEN 'audit_logs_entity_type_valid' THEN
          ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_valid CHECK (entity_type IN (
            'portfolio_mark', 'watch', 'alert', 'user', 'export'
          ));
        WHEN 'audit_logs_metadata_object' THEN
          ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_metadata_object
            CHECK (jsonb_typeof(metadata) = 'object');
        WHEN 'audit_logs_before_state_object' THEN
          ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_before_state_object
            CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object');
        WHEN 'audit_logs_after_state_object' THEN
          ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_after_state_object
            CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object');
        WHEN 'audit_logs_has_auditable_data' THEN
          ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_has_auditable_data CHECK (
            before_state IS NOT NULL OR after_state IS NOT NULL OR metadata <> '{}'::jsonb
          );
      END CASE;
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS audit_logs_firm_occurred_id_idx
  ON audit_logs (firm_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_occurred_idx
  ON audit_logs (actor_user_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_occurred_idx
  ON audit_logs (entity_type, entity_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_occurred_idx
  ON audit_logs (action, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_request_id_idx
  ON audit_logs (request_id) WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_audit_logs_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_reject_mutation ON audit_logs;
CREATE TRIGGER audit_logs_reject_mutation
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_audit_logs_mutation();
