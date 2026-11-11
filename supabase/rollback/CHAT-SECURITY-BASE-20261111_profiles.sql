-- Emergency rollback for migration CHAT-SECURITY-BASE-20261111.
-- WARNING: restores the pre-change profile exposure and grants. Use only to recover
-- application compatibility, then re-apply a corrected security migration.

begin;

drop function if exists public.admin_list_profiles();
drop function if exists public.get_my_access_status();

create or replace function public.create_private_chat(p_other_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid := auth.uid();
  v_chat_id bigint;
begin
  if v_current_user_id is null then raise exception 'Пользователь не авторизован'; end if;
  if v_current_user_id = p_other_user_id then raise exception 'Нельзя создать личный чат с самим собой'; end if;
  if not exists(select 1 from public.profiles where id = p_other_user_id and approved = true) then raise exception 'Пользователь не найден'; end if;
  select cm1.chat_id into v_chat_id
  from public.chat_members cm1
  join public.chat_members cm2 on cm2.chat_id = cm1.chat_id
  join public.chats c on c.id = cm1.chat_id
  where cm1.user_id = v_current_user_id
    and cm2.user_id = p_other_user_id
    and c.type = 'private'
    and (select count(*) from public.chat_members cm3 where cm3.chat_id = cm1.chat_id) = 2
  limit 1;
  if v_chat_id is not null then return v_chat_id; end if;
  insert into public.chats(name, type) values ('Личный чат', 'private') returning id into v_chat_id;
  insert into public.chat_members(chat_id, user_id) values (v_chat_id, v_current_user_id), (v_chat_id, p_other_user_id);
  return v_chat_id;
end;
$$;

grant select, insert, update on table public.profiles to authenticated;
grant references on table public.profiles to authenticated;

drop policy if exists authenticated_select_profiles on public.profiles;
create policy authenticated_select_profiles
on public.profiles
for select
to authenticated
using (true);

create policy authenticated_insert_profiles
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy admin_update_profiles
on public.profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role = 'admin'
      and admin_profile.approved = true
  )
)
with check (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role = 'admin'
      and admin_profile.approved = true
  )
);

commit;
