-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT pol.polname, pol.polrelid::regclass AS table_name
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND pol.polname = 'approved_users_only'
  LOOP
    EXECUTE format('DROP POLICY %I ON %s', p.polname, p.table_name);
  END LOOP;
END
$$;
