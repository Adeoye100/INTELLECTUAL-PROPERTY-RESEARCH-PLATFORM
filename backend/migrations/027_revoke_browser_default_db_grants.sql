-- Migration 027: Preserve the backend-only public-schema access boundary for
-- current and future application-owned tables and sequences.
--
-- Migration 013 revoked browser-role access from objects that existed at that
-- time. Supabase default privileges still granted future postgres-owned tables
-- and sequences to anon/authenticated, so later additive migrations could
-- silently reintroduce Data API privileges. Application business data remains
-- reachable only through the authenticated Render API; Supabase is browser-side
-- authentication only.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);

      -- ALTER DEFAULT PRIVILEGES without FOR ROLE targets the migration role,
      -- which owns application tables created by the migration runner.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
