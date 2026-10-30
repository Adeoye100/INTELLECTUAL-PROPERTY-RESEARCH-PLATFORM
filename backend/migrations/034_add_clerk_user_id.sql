ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS clerk_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_user_id_uidx
  ON public.users (clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;

COMMENT ON COLUMN public.users.clerk_user_id IS
  'Canonical identity link to Clerk user id (user_...); nullable during identity migration.';
