CREATE TABLE firm_invitations (
  id uuid PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES firms(id),
  issued_by_user_id uuid NOT NULL REFERENCES users(id),
  email text NOT NULL,
  intended_name text NOT NULL,
  role user_role NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_invitations_email_normalized CHECK (email = lower(btrim(email))),
  CONSTRAINT firm_invitations_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX firm_invitations_firm_id_idx ON firm_invitations (firm_id);
CREATE INDEX firm_invitations_email_idx ON firm_invitations (email);
