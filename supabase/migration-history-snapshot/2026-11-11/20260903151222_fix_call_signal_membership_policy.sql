-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.is_chat_member(p_chat_id bigint, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select exists(select 1 from public.chat_members where chat_id=p_chat_id and user_id=p_user_id);
$$;

revoke all on function public.is_chat_member(bigint,uuid) from public;
grant execute on function public.is_chat_member(bigint,uuid) to authenticated;

drop policy if exists call_signals_insert_sender on public.call_signals;
create policy call_signals_insert_sender on public.call_signals
for insert to authenticated
with check (
  sender_id=(select auth.uid())
  and sender_id<>recipient_id
  and public.is_chat_member(chat_id,(select auth.uid()))
  and public.is_chat_member(chat_id,recipient_id)
);
