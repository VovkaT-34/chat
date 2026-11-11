-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create table if not exists public.contact_nicknames (
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    target_user_id uuid not null references auth.users(id) on delete cascade,
    nickname text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (owner_user_id, target_user_id),
    constraint contact_nicknames_not_self check (owner_user_id <> target_user_id),
    constraint contact_nicknames_nickname_not_empty check (length(trim(nickname)) between 1 and 80)
);

alter table public.contact_nicknames enable row level security;

create policy authenticated_select_own_contact_nicknames
on public.contact_nicknames
for select
to authenticated
using (owner_user_id = auth.uid());

create policy authenticated_insert_own_contact_nicknames
on public.contact_nicknames
for insert
to authenticated
with check (owner_user_id = auth.uid() and owner_user_id <> target_user_id);

create policy authenticated_update_own_contact_nicknames
on public.contact_nicknames
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid() and owner_user_id <> target_user_id);

create policy authenticated_delete_own_contact_nicknames
on public.contact_nicknames
for delete
to authenticated
using (owner_user_id = auth.uid());

create or replace function public.get_chat_members(p_chat_id bigint)
returns table(user_id uuid, username text, nickname text, role text, is_admin boolean)
language sql
security definer
set search_path to 'public'
as $$
    select
        cm.user_id,
        p.username,
        cn.nickname,
        cm.role,
        exists (
            select 1
            from public.chat_members me
            where me.chat_id = p_chat_id
              and me.user_id = auth.uid()
              and me.role = 'admin'
        ) as is_admin
    from public.chat_members cm
    join public.profiles p on p.id = cm.user_id
    left join public.contact_nicknames cn
      on cn.owner_user_id = auth.uid()
     and cn.target_user_id = cm.user_id
    where cm.chat_id = p_chat_id
      and auth.uid() is not null
      and exists (
          select 1
          from public.chat_members viewer
          where viewer.chat_id = p_chat_id
            and viewer.user_id = auth.uid()
      )
    order by cm.role = 'admin' desc, lower(p.username), cm.user_id;
$$;

create or replace function public.add_chat_member(p_chat_id bigint, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if auth.uid() is null then
        raise exception 'Пользователь не авторизован';
    end if;

    if not exists (
        select 1 from public.chat_members
        where chat_id = p_chat_id and user_id = auth.uid() and role = 'admin'
    ) then
        raise exception 'Только администратор может добавлять пользователей';
    end if;

    if not exists (select 1 from public.profiles where id = p_user_id and approved = true) then
        raise exception 'Пользователь не найден или не одобрен';
    end if;

    insert into public.chat_members(chat_id, user_id, role)
    values (p_chat_id, p_user_id, 'member')
    on conflict do nothing;
end;
$$;

create or replace function public.update_my_username(p_username text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if auth.uid() is null then
        raise exception 'Пользователь не авторизован';
    end if;

    if p_username is null or length(trim(p_username)) < 1 or length(trim(p_username)) > 80 then
        raise exception 'Недопустимое имя';
    end if;

    update public.profiles
       set username = trim(p_username)
     where id = auth.uid();
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.contact_nicknames to authenticated;
grant execute on function public.get_chat_members(bigint) to authenticated;
grant execute on function public.add_chat_member(bigint, uuid) to authenticated;
grant execute on function public.update_my_username(text) to authenticated;
revoke all on function public.get_chat_members(bigint) from anon;
revoke all on function public.add_chat_member(bigint, uuid) from anon;
revoke all on function public.update_my_username(text) from anon;
