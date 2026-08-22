-- BE-18: firm-scoped, attributed Office Action references. This migration is
-- additive and repeat-safe; it stores bounded research metadata, never documents.
CREATE TABLE IF NOT EXISTS office_action_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  portfolio_mark_id uuid NOT NULL,
  source_registry varchar(100) NOT NULL,
  source_reference_id varchar(200) NOT NULL,
  application_number varchar(100),
  document_type varchar(80) NOT NULL,
  office_action_date date,
  examiner_name varchar(200),
  examiner_reasoning_summary varchar(4000),
  summary_method varchar(20) NOT NULL,
  source_document_url varchar(2048),
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_action_refs_portfolio_mark_firm_key FOREIGN KEY (firm_id, portfolio_mark_id)
    REFERENCES portfolio_marks(firm_id, id),
  CONSTRAINT office_action_refs_source_registry_not_blank CHECK (btrim(source_registry) <> ''),
  CONSTRAINT office_action_refs_source_reference_not_blank CHECK (btrim(source_reference_id) <> ''),
  CONSTRAINT office_action_refs_document_type_not_blank CHECK (btrim(document_type) <> ''),
  CONSTRAINT office_action_refs_summary_method_valid CHECK (
    summary_method IN ('registry', 'manual', 'extracted')
  ),
  CONSTRAINT office_action_refs_source_metadata_object CHECK (
    jsonb_typeof(source_metadata) = 'object'
  ),
  CONSTRAINT office_action_refs_firm_mark_source_reference_key UNIQUE (
    firm_id, portfolio_mark_id, source_registry, source_reference_id
  )
);

CREATE INDEX IF NOT EXISTS office_action_refs_firm_portfolio_mark_idx
  ON office_action_refs (firm_id, portfolio_mark_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS office_action_refs_source_reference_idx
  ON office_action_refs (source_registry, source_reference_id);
CREATE INDEX IF NOT EXISTS office_action_refs_application_number_idx
  ON office_action_refs (application_number) WHERE application_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS office_action_refs_office_action_date_idx
  ON office_action_refs (office_action_date) WHERE office_action_date IS NOT NULL;

-- BE-16's immutable action/entity checks are extended without changing audit
-- rows. The replacement is necessary because the existing closed allow-lists
-- would otherwise reject the new Office Action audit events.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
  'portfolio_mark.created', 'portfolio_mark.updated', 'portfolio_mark.deleted',
  'watch.created', 'watch.updated', 'watch.deleted', 'watch.enabled', 'watch.disabled',
  'alert.read', 'alert.dismissed',
  'user.role_changed',
  'export.requested', 'export.completed', 'export.failed',
  'office_action_ref.created', 'office_action_ref.updated', 'office_action_ref.deleted'
));

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_type_valid;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_valid CHECK (entity_type IN (
  'portfolio_mark', 'watch', 'alert', 'user', 'export', 'office_action_ref'
));
