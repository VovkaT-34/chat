-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

revoke execute on function public.cleanup_old_messages() from public, anon, authenticated;
