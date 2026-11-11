-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

drop function if exists public.get_my_group_chats();
create function public.get_my_group_chats()
returns table(chat_id bigint, chat_name text, last_message_at timestamptz)
language sql
security definer
set search_path=public
as $$
 select c.id as chat_id,
        c.name as chat_name,
        (select max(m.created_at) from public.messages m where m.chat_id=c.id) as last_message_at
 from public.chats c
 join public.chat_members cm on cm.chat_id=c.id
 where cm.user_id=auth.uid()
   and c.type='private'
   and (select count(*) from public.chat_members cm2 where cm2.chat_id=c.id) >= 3
 order by 3 desc nulls last, c.id desc;
$$;
revoke all on function public.get_my_group_chats() from public;
grant execute on function public.get_my_group_chats() to authenticated;
