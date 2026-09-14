-- Harden helper/trigger functions surfaced by Supabase security advisors.
-- These helpers are Supabase-environment additions and are not guaranteed to
-- exist in the repository's bare PostgreSQL integration-test database.
-- Apply every change conditionally so the migration is portable and idempotent.

DO $$
BEGIN
  IF to_regprocedure('public.keep_alive()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.keep_alive() SET search_path = pg_catalog';
    EXECUTE 'REVOKE ALL ON FUNCTION public.keep_alive() FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.keep_alive() FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.keep_alive() FROM authenticated';
    END IF;
  END IF;

  IF to_regprocedure('public.reject_audit_logs_mutation()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.reject_audit_logs_mutation() SET search_path = pg_catalog';
  END IF;

  IF to_regprocedure('public.reject_search_results_mutation()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.reject_search_results_mutation() SET search_path = pg_catalog';
  END IF;

  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated';
    END IF;
  END IF;
END;
$$;
