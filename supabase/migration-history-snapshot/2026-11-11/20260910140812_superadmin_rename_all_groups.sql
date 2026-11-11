-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.rename_group_chat(p_chat_id bigint, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Пользователь не авторизован'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'Название группы не указано'; end if;
  if not exists (
    select 1 from public.chats c
    where c.id = p_chat_id
      and (c.created_by = auth.uid()
           or exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='superadmin'))
  ) then raise exception 'Нет прав на изменение названия группы'; end if;
  update public.chats set name=trim(p_name) where id=p_chat_id;
end;
$$;
