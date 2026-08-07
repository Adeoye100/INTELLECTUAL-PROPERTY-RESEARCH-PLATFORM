CREATE TABLE registry_trademarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_registry text NOT NULL,
  source_reference_id text NOT NULL,
  mark_text text NOT NULL,
  owner text,
  jurisdiction text NOT NULL,
  nice_classes integer[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  raw_status_code text,
  filing_date date,
  source_updated_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  elasticsearch_synced_at timestamptz,
  UNIQUE (source_registry, source_reference_id),
  CHECK (jurisdiction <> ''),
  CHECK (source_registry <> ''),
  CHECK (source_reference_id <> ''),
  CHECK (mark_text <> '')
);

CREATE INDEX registry_trademarks_projection_idx
  ON registry_trademarks (updated_at)
  WHERE elasticsearch_synced_at IS NULL
     OR elasticsearch_synced_at < updated_at;

CREATE INDEX registry_trademarks_mark_text_idx
  ON registry_trademarks (mark_text);
