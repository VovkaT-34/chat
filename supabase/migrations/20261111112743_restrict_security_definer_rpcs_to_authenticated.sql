-- Remove implicit PUBLIC/anon execution from exposed SECURITY DEFINER RPCs.
-- Preserve the existing authenticated execution surface exactly.
-- Maintenance functions that authenticated could not execute before remain unchanged.

DO $$
DECLARE
  f record;
  v_signature text;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    v_signature := f.signature;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_signature);
  END LOOP;
END
$$;
