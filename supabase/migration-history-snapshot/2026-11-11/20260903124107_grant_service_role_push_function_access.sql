-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

grant select on public.messages to service_role;
grant select on public.chat_members to service_role;
grant select on public.profiles to service_role;
grant select on public.user_chat_reads to service_role;
grant select, delete on public.web_push_subscriptions to service_role;
