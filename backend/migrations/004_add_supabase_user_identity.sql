-- Canonical cross-system identity link. This UUID is the verified `sub` from
-- Supabase Auth. It deliberately has no foreign key because auth.users lives in
-- a separate PostgreSQL database.
ALTER TABLE users ADD COLUMN supabase_user_id uuid;

ALTER TABLE users
  ADD CONSTRAINT users_supabase_user_id_key UNIQUE (supabase_user_id);

COMMENT ON COLUMN users.supabase_user_id IS
  'Canonical link to Supabase auth.users.id; nullable during the identity migration.';
