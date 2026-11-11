-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

revoke all on function public.update_my_profile(text) from public; grant execute on function public.update_my_profile(text) to authenticated;
