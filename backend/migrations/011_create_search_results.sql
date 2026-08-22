-- BE-19: immutable, tenant-scoped historical search snapshots.
-- This migration is additive and repeat-safe. PostgreSQL timestamptz values
-- are stored in UTC. Retention is an operational process, never an API update
-- or delete path.
CREATE TABLE IF NOT EXISTS search_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  requested_by_user_id uuid NOT NULL REFERENCES users(id),
  request_id varchar(128) NOT NULL,
  query_snapshot jsonb NOT NULL,
  results_snapshot jsonb NOT NULL,
  source_statuses jsonb NOT NULL,
  partial boolean NOT NULL,
  result_count integer NOT NULL,
  methodology_versions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_results_request_id_not_blank CHECK (btrim(request_id) <> ''),
  CONSTRAINT search_results_query_snapshot_object CHECK (jsonb_typeof(query_snapshot) = 'object'),
  CONSTRAINT search_results_results_snapshot_array CHECK (jsonb_typeof(results_snapshot) = 'array'),
  CONSTRAINT search_results_source_statuses_array CHECK (jsonb_typeof(source_statuses) = 'array'),
  CONSTRAINT search_results_methodology_versions_array CHECK (jsonb_typeof(methodology_versions) = 'array'),
  CONSTRAINT search_results_result_count_nonnegative CHECK (result_count >= 0),
  CONSTRAINT search_results_firm_request_id_key UNIQUE (firm_id, request_id)
);

-- Support repeat runs against a manually/interrupted provisioned table without
-- altering existing snapshot data.
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS requested_by_user_id uuid;
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS request_id varchar(128);
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS query_snapshot jsonb;
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS results_snapshot jsonb;
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS source_statuses jsonb;
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS partial boolean;
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS result_count integer;
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS methodology_versions jsonb;
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS created_at timestamptz;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOREACH constraint_name IN ARRAY ARRAY[
    'search_results_request_id_not_blank',
    'search_results_query_snapshot_object',
    'search_results_results_snapshot_array',
    'search_results_source_statuses_array',
    'search_results_methodology_versions_array',
    'search_results_result_count_nonnegative',
    'search_results_firm_request_id_key'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'search_results'::regclass AND conname = constraint_name
    ) THEN
      CASE constraint_name
        WHEN 'search_results_request_id_not_blank' THEN
          ALTER TABLE search_results ADD CONSTRAINT search_results_request_id_not_blank
            CHECK (btrim(request_id) <> '');
        WHEN 'search_results_query_snapshot_object' THEN
          ALTER TABLE search_results ADD CONSTRAINT search_results_query_snapshot_object
            CHECK (jsonb_typeof(query_snapshot) = 'object');
        WHEN 'search_results_results_snapshot_array' THEN
          ALTER TABLE search_results ADD CONSTRAINT search_results_results_snapshot_array
            CHECK (jsonb_typeof(results_snapshot) = 'array');
        WHEN 'search_results_source_statuses_array' THEN
          ALTER TABLE search_results ADD CONSTRAINT search_results_source_statuses_array
            CHECK (jsonb_typeof(source_statuses) = 'array');
        WHEN 'search_results_methodology_versions_array' THEN
          ALTER TABLE search_results ADD CONSTRAINT search_results_methodology_versions_array
            CHECK (jsonb_typeof(methodology_versions) = 'array');
        WHEN 'search_results_result_count_nonnegative' THEN
          ALTER TABLE search_results ADD CONSTRAINT search_results_result_count_nonnegative
            CHECK (result_count >= 0);
        WHEN 'search_results_firm_request_id_key' THEN
          ALTER TABLE search_results ADD CONSTRAINT search_results_firm_request_id_key
            UNIQUE (firm_id, request_id);
      END CASE;
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS search_results_firm_created_id_idx
  ON search_results (firm_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS search_results_firm_requester_created_id_idx
  ON search_results (firm_id, requested_by_user_id, created_at DESC, id DESC);
-- The unique firm/request constraint above provides the required firm +
-- request_id lookup index without maintaining a duplicate btree.

CREATE OR REPLACE FUNCTION reject_search_results_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'search_results is append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS search_results_reject_mutation ON search_results;
CREATE TRIGGER search_results_reject_mutation
  BEFORE UPDATE OR DELETE ON search_results
  FOR EACH ROW EXECUTE FUNCTION reject_search_results_mutation();

-- Extend BE-16's closed audit allow-lists for the one bounded search event.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
  'portfolio_mark.created', 'portfolio_mark.updated', 'portfolio_mark.deleted',
  'watch.created', 'watch.updated', 'watch.deleted', 'watch.enabled', 'watch.disabled',
  'alert.read', 'alert.dismissed',
  'user.role_changed',
  'export.requested', 'export.completed', 'export.failed',
  'office_action_ref.created', 'office_action_ref.updated', 'office_action_ref.deleted',
  'search.executed'
));

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_type_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_valid CHECK (entity_type IN (
  'portfolio_mark', 'watch', 'alert', 'user', 'export', 'office_action_ref', 'search_result'
));
