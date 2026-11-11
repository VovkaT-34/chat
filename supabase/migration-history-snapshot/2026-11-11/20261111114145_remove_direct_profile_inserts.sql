-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

REVOKE INSERT ON TABLE public.profiles FROM authenticated;
REVOKE INSERT (id, username, created_at, email, approved, role, public_id)
ON TABLE public.profiles FROM authenticated;
DROP POLICY authenticated_insert_profiles ON public.profiles;
