-- Restrict authenticated profile reads to non-sensitive fields.
-- Administrative profile data is returned only through guarded SECURITY DEFINER RPCs.

REVOKE SELECT ON TABLE public.profiles FROM authenticated;
GRANT SELECT (id, username, created_at, public_id)
ON TABLE public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.check_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_my_profile() TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
