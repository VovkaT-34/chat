-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

REVOKE EXECUTE ON FUNCTION public.is_chat_member(bigint, uuid) FROM PUBLIC, anon, authenticated;
