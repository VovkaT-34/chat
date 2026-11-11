-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.rename_group_chat(p_chat_id bigint, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Пользователь не авторизован';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Название группы не указано';
  end if;

  if not exists (
    select 1
    from public.chat_members cm
    join public.chats c on c.id = cm.chat_id
    where cm.chat_id = p_chat_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
      and c.type = 'private'
  ) then
    raise exception 'Нет прав на изменение названия группы';
  end if;

  update public.chats
  set name = trim(p_name)
  where id = p_chat_id;
end;
$$;

revoke all on function public.rename_group_chat(bigint, text) from public;
grant execute on function public.rename_group_chat(bigint, text) to authenticated;
