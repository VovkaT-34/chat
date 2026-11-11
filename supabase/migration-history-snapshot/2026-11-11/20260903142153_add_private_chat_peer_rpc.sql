-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.get_private_chat_peer(p_chat_id bigint)
returns table(user_id uuid, username text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.username
  from public.chat_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.chat_id = p_chat_id
    and cm.user_id <> auth.uid()
    and exists (
      select 1 from public.chat_members own
      where own.chat_id = p_chat_id
        and own.user_id = auth.uid()
    )
    and (select count(*) from public.chat_members all_members where all_members.chat_id = p_chat_id) = 2
  limit 1;
$$;
revoke all on function public.get_private_chat_peer(bigint) from public;
grant execute on function public.get_private_chat_peer(bigint) to authenticated;
