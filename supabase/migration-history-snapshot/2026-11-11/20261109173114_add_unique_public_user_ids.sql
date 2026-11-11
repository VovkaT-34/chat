-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

alter table public.profiles
  add column if not exists public_id text;

create or replace function public.assign_profile_public_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  candidate text;
begin
  if new.public_id is null or btrim(new.public_id) = '' then
    loop
      candidate := 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit when not exists (
        select 1 from public.profiles p
        where lower(p.public_id) = lower(candidate)
      );
    end loop;
    new.public_id := candidate;
  end if;
  return new;
end;
$$;

update public.profiles p
set public_id = 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
where p.public_id is null or btrim(p.public_id) = '';

create unique index if not exists profiles_public_id_lower_uidx
  on public.profiles (lower(public_id));

alter table public.profiles
  alter column public_id set not null;

drop trigger if exists profiles_assign_public_id on public.profiles;
create trigger profiles_assign_public_id
before insert on public.profiles
for each row execute function public.assign_profile_public_id();

create or replace function public.update_my_public_id(p_public_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_id text := lower(btrim(coalesce(p_public_id, '')));
begin
  if auth.uid() is null then
    raise exception 'Пользователь не авторизован';
  end if;

  if normalized_id !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'ID должен содержать от 3 до 24 латинских букв, цифр или символов подчёркивания';
  end if;

  if exists (
    select 1 from public.profiles p
    where lower(p.public_id) = normalized_id
      and p.id <> auth.uid()
  ) then
    raise exception 'Этот ID уже занят';
  end if;

  update public.profiles
     set public_id = normalized_id
   where id = auth.uid();

  if not found then
    raise exception 'Профиль пользователя не найден';
  end if;
end;
$$;

revoke all on function public.update_my_public_id(text) from public;
grant execute on function public.update_my_public_id(text) to authenticated;

drop function if exists public.search_users(text);
create function public.search_users(p_search text)
returns table(id uuid, username text, public_id text)
language sql
security definer
set search_path = public
as $function$
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
$function$;

grant execute on function public.search_users(text) to authenticated;

drop function if exists public.get_chat_members(bigint);
create function public.get_chat_members(p_chat_id bigint)
returns table(user_id uuid, username text, public_id text, nickname text, role text, is_admin boolean)
language sql
security definer
set search_path = public
as $function$
  select
    cm.user_id,
    p.username,
    p.public_id,
    cn.nickname,
    cm.role,
    exists(
      select 1 from public.chat_members me
      where me.chat_id = p_chat_id and me.user_id = auth.uid() and me.role = 'admin'
    )
    or exists(
      select 1 from public.profiles gp
      where gp.id = auth.uid() and gp.approved = true and gp.role in ('admin','superadmin')
    ) as is_admin
  from public.chat_members cm
  join public.profiles p on p.id = cm.user_id
  left join public.contact_nicknames cn
    on cn.owner_user_id = auth.uid() and cn.target_user_id = cm.user_id
  where cm.chat_id = p_chat_id
    and auth.uid() is not null
    and (
      exists(
        select 1 from public.chat_members viewer
        where viewer.chat_id = p_chat_id and viewer.user_id = auth.uid()
      )
      or exists(
        select 1 from public.profiles gp
        where gp.id = auth.uid() and gp.approved = true and gp.role in ('admin','superadmin')
      )
    )
  order by cm.role = 'admin' desc, lower(p.username), cm.user_id;
$function$;

grant execute on function public.get_chat_members(bigint) to authenticated;
