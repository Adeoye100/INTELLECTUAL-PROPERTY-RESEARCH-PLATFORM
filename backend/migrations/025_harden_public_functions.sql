-- Harden helper/trigger functions surfaced by Supabase security advisors.
-- The application uses server-side database access; browser roles must not be
-- able to invoke SECURITY DEFINER maintenance functions through PostgREST.

ALTER FUNCTION public.keep_alive() SET search_path = pg_catalog;
ALTER FUNCTION public.reject_audit_logs_mutation() SET search_path = pg_catalog;
ALTER FUNCTION public.reject_search_results_mutation() SET search_path = pg_catalog;

REVOKE ALL ON FUNCTION public.keep_alive() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.keep_alive() FROM anon;
REVOKE ALL ON FUNCTION public.keep_alive() FROM authenticated;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated;
