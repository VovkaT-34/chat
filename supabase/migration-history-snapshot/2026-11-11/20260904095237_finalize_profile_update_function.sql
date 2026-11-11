-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

comment on function public.update_my_profile(text) is 'Authenticated user may update only their own profile username; execute granted only to authenticated role.';
