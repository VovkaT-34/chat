-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

revoke execute on function public.get_chat_members(bigint) from public, anon;
revoke execute on function public.add_chat_member(bigint, uuid) from public, anon;
revoke execute on function public.update_my_username(text) from public, anon;
grant execute on function public.get_chat_members(bigint) to authenticated;
grant execute on function public.add_chat_member(bigint, uuid) to authenticated;
grant execute on function public.update_my_username(text) to authenticated;
