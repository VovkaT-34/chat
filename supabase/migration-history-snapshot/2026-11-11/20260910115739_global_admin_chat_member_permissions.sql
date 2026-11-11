-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.add_chat_member(p_chat_id bigint, p_user_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'Пользователь не авторизован'; end if;
  if not exists (
    select 1 from public.profiles
    where id=auth.uid() and approved=true and role in ('admin','superadmin')
  ) and not exists (
    select 1 from public.chat_members
    where chat_id=p_chat_id and user_id=auth.uid() and role='admin'
  ) then raise exception 'Только администратор может добавлять пользователей'; end if;
  if not exists (select 1 from public.profiles where id=p_user_id and approved=true) then
    raise exception 'Пользователь не найден или не одобрен';
  end if;
  insert into public.chat_members(chat_id,user_id,role)
  values(p_chat_id,p_user_id,'member') on conflict do nothing;
end;
$$;

create or replace function public.remove_chat_member(p_chat_id bigint, p_user_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'Пользователь не авторизован'; end if;
  if not exists (
    select 1 from public.profiles
    where id=auth.uid() and approved=true and role in ('admin','superadmin')
  ) and not exists (
    select 1 from public.chat_members
    where chat_id=p_chat_id and user_id=auth.uid() and role='admin'
  ) then raise exception 'Только администратор может удалять пользователей'; end if;
  if p_user_id=auth.uid() then raise exception 'Администратор не может удалить самого себя'; end if;
  delete from public.chat_members where chat_id=p_chat_id and user_id=p_user_id;
end;
$$;

create or replace function public.get_chat_members(p_chat_id bigint)
returns table(user_id uuid, username text, nickname text, role text, is_admin boolean)
language sql security definer set search_path to 'public'
as $$
  select cm.user_id,p.username,cn.nickname,cm.role,
    exists(select 1 from public.chat_members me where me.chat_id=p_chat_id and me.user_id=auth.uid() and me.role='admin')
    or exists(select 1 from public.profiles gp where gp.id=auth.uid() and gp.approved=true and gp.role in ('admin','superadmin')) as is_admin
  from public.chat_members cm
  join public.profiles p on p.id=cm.user_id
  left join public.contact_nicknames cn on cn.owner_user_id=auth.uid() and cn.target_user_id=cm.user_id
  where cm.chat_id=p_chat_id and auth.uid() is not null
    and (exists(select 1 from public.chat_members viewer where viewer.chat_id=p_chat_id and viewer.user_id=auth.uid())
      or exists(select 1 from public.profiles gp where gp.id=auth.uid() and gp.approved=true and gp.role in ('admin','superadmin')))
  order by cm.role='admin' desc,lower(p.username),cm.user_id;
$$;
