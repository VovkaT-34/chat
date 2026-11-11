-- CHAT-SECURITY-BASE-20261111
-- Restrict direct profile access and move private profile fields behind authenticated RPCs.

begin;

-- Remove inherited PUBLIC/anon execution from public SECURITY DEFINER functions.
-- Preserve the effective authenticated access that existed before this migration.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute,
           p.prorettype::regtype::text as return_type
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    if f.auth_can_execute and f.return_type not in ('trigger', 'event_trigger') then
      execute format('grant execute on function %s to authenticated', f.signature);
    end if;
  end loop;
end;
$$;

-- Profile creation is already performed by the trusted auth.users trigger.
-- Browser clients need only the non-sensitive identity columns.
revoke all privileges on table public.profiles from anon, authenticated;
grant select (id, username, public_id) on table public.profiles to authenticated;

drop policy if exists authenticated_insert_profiles on public.profiles;
drop policy if exists admin_update_profiles on public.profiles;
drop policy if exists authenticated_select_profiles on public.profiles;

-- This helper is used by RLS policies without exposing private profile columns.
create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved is true
  );
$;

revoke all on function public.is_approved_user() from public, anon;
grant execute on function public.is_approved_user() to authenticated;

create policy authenticated_select_profiles
on public.profiles
for select
to authenticated
using (public.is_approved_user());

-- Defense in depth: unapproved accounts cannot access chat data through direct Data API calls.
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
    execute format(
      'create policy approved_users_only on public.%I as restrictive for all to authenticated using (public.is_approved_user()) with check (public.is_approved_user())',
      table_name
    );
  end loop;
end;
$;

-- A user can read only their own approval state and role through this RPC.
create or replace function public.get_my_access_status()
returns table (approved boolean, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.approved, p.role
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_my_access_status() from public, anon;
grant execute on function public.get_my_access_status() to authenticated;

-- Administrative profile listing replaces direct SELECT * from profiles.
create or replace function public.admin_list_profiles()
returns table (
  id uuid,
  email text,
  username text,
  approved boolean,
  role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved is true
      and p.role in ('admin', 'superadmin')
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select p.id, p.email, p.username, p.approved, p.role
  from public.profiles p
  order by lower(p.username), p.id;
end;
$$;

revoke all on function public.admin_list_profiles() from public, anon;
grant execute on function public.admin_list_profiles() to authenticated;

-- Both participants must be approved before a private chat can be created.
create or replace function public.create_private_chat(p_other_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_user_id uuid := (select auth.uid());
  v_chat_id bigint;
begin
  if v_current_user_id is null then
    raise exception 'Пользователь не авторизован';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_current_user_id and approved is true
  ) then
    raise exception 'Аккаунт не одобрен';
  end if;

  if v_current_user_id = p_other_user_id then
    raise exception 'Нельзя создать личный чат с самим собой';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_other_user_id and approved is true
  ) then
    raise exception 'Пользователь не найден или не одобрен';
  end if;

  select cm1.chat_id into v_chat_id
  from public.chat_members cm1
  join public.chat_members cm2 on cm2.chat_id = cm1.chat_id
  join public.chats c on c.id = cm1.chat_id
  where cm1.user_id = v_current_user_id
    and cm2.user_id = p_other_user_id
    and c.type = 'private'
    and (
      select count(*) from public.chat_members cm3
      where cm3.chat_id = cm1.chat_id
    ) = 2
  limit 1;

  if v_chat_id is not null then
    return v_chat_id;
  end if;

  insert into public.chats(name, type)
  values ('Личный чат', 'private')
  returning id into v_chat_id;

  insert into public.chat_members(chat_id, user_id)
  values (v_chat_id, v_current_user_id), (v_chat_id, p_other_user_id);

  return v_chat_id;
end;
$$;

-- User search is also restricted to approved accounts.
create or replace function public.search_users(p_search text)
returns table (id uuid, username text, public_id text)
language sql
security definer
set search_path = ''
as $
  select p.id, p.username, p.public_id
  from public.profiles p
  where (select auth.uid()) is not null
    and public.is_approved_user()
    and p.approved is true
    and p.id <> (select auth.uid())
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

commit;
