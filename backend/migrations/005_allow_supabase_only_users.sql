-- Supabase Auth is the sole password authority. Local user rows retain the
-- legacy column temporarily for rollback compatibility, but all new rows leave
-- it null until SB-06 removes the column entirely.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

COMMENT ON COLUMN users.password_hash IS
  'Legacy local credential hash; null for identities managed by Supabase Auth.';
