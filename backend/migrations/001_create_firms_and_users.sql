CREATE TYPE user_role AS ENUM ('admin', 'attorney', 'viewer');

CREATE TABLE firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subscription_tier text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Firm identity is currently an exact match after trimming, collapsing internal
-- whitespace, and lower-casing. The expression index makes that application rule
-- race-safe without adding a column not present in Schema section 2.
CREATE UNIQUE INDEX firms_normalized_name_uidx
  ON firms ((lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))));

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE INDEX users_firm_id_idx ON users (firm_id);
