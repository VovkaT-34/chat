-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

-- Keep only non-sensitive profile fields directly readable by authenticated clients.
-- Admin email/role/approval data remains available through guarded SECURITY DEFINER RPCs.
REVOKE SELECT ON TABLE public.profiles FROM authenticated;
GRANT SELECT (id, username, created_at, public_id) ON TABLE public.profiles TO authenticated;

-- This RPC returns only the caller's own approval state and role.
REVOKE ALL ON FUNCTION public.check_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_my_profile() TO authenticated;

-- Personal username RPC must not be callable without authentication.
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
