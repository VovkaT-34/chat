-- Profile rows are created only by the auth.users AFTER INSERT trigger.
-- Browser clients must not insert profiles directly.
REVOKE INSERT ON TABLE public.profiles FROM authenticated;
REVOKE INSERT (id, username, created_at, email, approved, role, public_id)
ON TABLE public.profiles FROM authenticated;
DROP POLICY authenticated_insert_profiles ON public.profiles;
