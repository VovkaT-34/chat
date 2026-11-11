-- Emergency rollback for CHAT-SECURITY-BASE-20261111.
-- This restores the original grants and policies, including the original profile exposure.
-- Use only if the application cannot operate after the security migration.

begin;

drop function if exists public.admin_list_profiles();
drop function if exists public.get_my_access_status();

-- Remove approval-only RLS policies before restoring the original profile policy.
do $
declare
  table_name text;
begin
  foreach table_name in array array[
    'android_push_tokens',
    'call_signals',
    'chat_members',
    'chat_notification_settings',
    'chats',
    'contact_nicknames',
    'message_deliveries',
    'messages',
    'user_chat_reads',
    'web_push_subscriptions'
  ]
  loop
    execute format('drop policy if exists approved_users_only on public.%I', table_name);
  end loop;
end;
$;

create or replace function public.search_users(p_search text)
returns table(id uuid, username text, public_id text)
language sql
security definer
set search_path = public
as $
  select p.id, p.username, p.public_id
  from public.profiles p
  where auth.uid() is not null
    and p.approved = true
    and p.id <> auth.uid()
    and p.username is not null
    and (
      p.username ilike '%' || ltrim(trim(coalesce(p_search, '')), '@') || '%'
      or p.public_id ilike '%' || ltrim(trim(coalesce(p_search, '')), '@') || '%'
    )
  order by
    case when lower(p.public_id) = lower(ltrim(trim(coalesce(p_search, '')), '@')) then 0 else 1 end,
    p.username
  limit 20;
$;

drop function if exists public.is_approved_user();

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

grant all privileges on table public.profiles to authenticated;
grant truncate, references, trigger, maintain on table public.profiles to anon;

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
    select 1 from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role = 'admin'
      and admin_profile.approved = true
  )
)
with check (
  exists (
    select 1 from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role = 'admin'
      and admin_profile.approved = true
  )
);

-- Restore PUBLIC execution only for the functions that had it before this migration.
grant execute on function public.check_my_profile() to public;
grant execute on function public.create_private_chat(uuid) to public;
grant execute on function public.delete_group_chat(bigint) to public;
grant execute on function public.get_chat_members(bigint) to public;
grant execute on function public.get_group_messages_for_superadmin(bigint,bigint,integer) to public;
grant execute on function public.get_message_read_status(bigint) to public;
grant execute on function public.get_message_status(bigint) to public;
grant execute on function public.get_my_chat_list_data(bigint[]) to public;
grant execute on function public.get_my_group_chats() to public;
grant execute on function public.get_my_private_chats() to public;
grant execute on function public.get_my_profile() to public;
grant execute on function public.get_my_unread_counts(bigint[]) to public;
grant execute on function public.get_my_unread_counts() to public;
grant execute on function public.get_public_chats() to public;
grant execute on function public.get_unread_messages_count(uuid,bigint) to public;
grant execute on function public.handle_new_user_profile() to public;
grant execute on function public.is_admin() to public;
grant execute on function public.is_chat_member(bigint) to public;
grant execute on function public.is_public_chat(bigint) to public;
grant execute on function public.leave_chat(bigint) to public;
grant execute on function public.mark_message_delivered(bigint) to public;
grant execute on function public.rls_auto_enable() to public;
grant execute on function public.search_users(text) to public;

-- Remove explicit authenticated grants added by the migration where the baseline ACL was NULL.
revoke execute on function public.check_my_profile() from authenticated;
revoke execute on function public.create_private_chat(uuid) from authenticated;
revoke execute on function public.get_message_read_status(bigint) from authenticated;
revoke execute on function public.get_message_status(bigint) from authenticated;
revoke execute on function public.get_my_chat_list_data(bigint[]) from authenticated;
revoke execute on function public.get_my_private_chats() from authenticated;
revoke execute on function public.get_my_profile() from authenticated;
revoke execute on function public.get_my_unread_counts(bigint[]) from authenticated;
revoke execute on function public.get_my_unread_counts() from authenticated;
revoke execute on function public.get_public_chats() from authenticated;
revoke execute on function public.get_unread_messages_count(uuid,bigint) from authenticated;
revoke execute on function public.is_admin() from authenticated;
revoke execute on function public.is_chat_member(bigint) from authenticated;
revoke execute on function public.is_public_chat(bigint) from authenticated;
revoke execute on function public.mark_message_delivered(bigint) from authenticated;

commit;
