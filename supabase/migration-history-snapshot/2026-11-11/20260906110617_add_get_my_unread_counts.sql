-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.get_my_unread_counts()
returns table(chat_id bigint, unread_count bigint)
language sql
security definer
set search_path = public
as $$
  select c.id as chat_id,
         count(m.id) as unread_count
  from public.chats c
  join public.messages m on m.chat_id = c.id
  left join public.user_chat_reads r
    on r.user_id = auth.uid()
   and r.chat_id = c.id
  where auth.uid() is not null
    and m.id > coalesce(r.last_read_message_id, 0)
    and m.user_id <> auth.uid()
    and (
      c.type = 'public'
      or exists (
        select 1 from public.chat_members cm
        where cm.chat_id = c.id and cm.user_id = auth.uid()
      )
    )
  group by c.id;$$;
