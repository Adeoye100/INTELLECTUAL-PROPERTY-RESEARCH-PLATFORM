-- BE-11: Portfolio marks are tenant-scoped PostgreSQL records. This migration
-- is intentionally additive and leaves a pre-existing table untouched.
CREATE TABLE IF NOT EXISTS portfolio_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  owner_user_id uuid REFERENCES users(id),
  mark_text varchar(200) NOT NULL,
  jurisdiction varchar(8) NOT NULL,
  source_registry varchar(100) NOT NULL,
  registry_reference varchar(200) NOT NULL,
  nice_classes integer[] NOT NULL,
  status varchar(20) NOT NULL,
  filing_date date,
  registration_date date,
  renewal_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_marks_mark_text_not_blank CHECK (btrim(mark_text) <> ''),
  CONSTRAINT portfolio_marks_jurisdiction_not_blank CHECK (btrim(jurisdiction) <> ''),
  CONSTRAINT portfolio_marks_source_registry_not_blank CHECK (btrim(source_registry) <> ''),
  CONSTRAINT portfolio_marks_registry_reference_not_blank CHECK (btrim(registry_reference) <> ''),
  CONSTRAINT portfolio_marks_nice_classes_not_empty CHECK (cardinality(nice_classes) > 0),
  CONSTRAINT portfolio_marks_nice_classes_in_range CHECK (
    nice_classes <@ ARRAY[
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
      16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
      31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45
    ]::integer[]
  ),
  CONSTRAINT portfolio_marks_status_valid CHECK (
    status IN ('pending', 'filed', 'registered', 'abandoned', 'expired', 'cancelled')
  ),
  CONSTRAINT portfolio_marks_firm_registry_reference_key UNIQUE (
    firm_id, source_registry, registry_reference
  )
);

CREATE INDEX IF NOT EXISTS portfolio_marks_firm_id_idx ON portfolio_marks (firm_id);
CREATE INDEX IF NOT EXISTS portfolio_marks_renewal_date_idx
  ON portfolio_marks (renewal_date) WHERE renewal_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS portfolio_marks_status_idx ON portfolio_marks (status);
CREATE INDEX IF NOT EXISTS portfolio_marks_registry_reference_idx
  ON portfolio_marks (source_registry, registry_reference);
