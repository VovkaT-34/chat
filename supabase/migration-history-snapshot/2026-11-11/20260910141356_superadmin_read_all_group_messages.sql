-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.get_group_messages_for_superadmin(p_chat_id bigint, p_before_id bigint default null, p_limit integer default 10)
returns table(
  id bigint,
  user_id uuid,
  text text,
  created_at timestamptz,
  reply_to bigint,
  username text,
  reply_text text,
  reply_username text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin' and p.approved = true
  ) then
    raise exception 'Только супер администратор может просматривать сообщения этой группы';
  end if;

  if not exists (
    select 1 from public.chats c
    where c.id = p_chat_id and c.type = 'private'
      and (select count(*) from public.chat_members cm where cm.chat_id = c.id) >= 3
  ) then
    raise exception 'Группа не найдена';
  end if;

  return query
  select m.id, m.user_id, m.text, m.created_at, m.reply_to,
         p.username,
         rm.text as reply_text,
         rp.username as reply_username
  from public.messages m
  left join public.profiles p on p.id = m.user_id
  left join public.messages rm on rm.id = m.reply_to
  left join public.profiles rp on rp.id = rm.user_id
  where m.chat_id = p_chat_id
    and (p_before_id is null or m.id < p_before_id)
  order by m.id desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

grant execute on function public.get_group_messages_for_superadmin(bigint,bigint,integer) to authenticated;
