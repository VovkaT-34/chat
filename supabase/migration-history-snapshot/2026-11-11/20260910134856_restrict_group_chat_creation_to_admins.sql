-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.create_group_chat(p_name text, p_user_ids uuid[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_chat_id bigint;
    v_user_id uuid;
    v_role text;
begin
    if auth.uid() is null then
        raise exception 'Пользователь не авторизован';
    end if;

    select role into v_role
    from public.profiles
    where id = auth.uid();

    if v_role not in ('admin', 'superadmin') then
        raise exception 'Создавать группы могут только администраторы';
    end if;

    if p_name is null or trim(p_name) = '' then
        raise exception 'Название группы не указано';
    end if;

    if p_user_ids is null or array_length(p_user_ids, 1) is null then
        raise exception 'Не выбраны пользователи';
    end if;

    if array_length(p_user_ids, 1) < 2 then
        raise exception 'Для группового чата нужно минимум 2 других пользователя';
    end if;

    insert into public.chats (name, type)
    values (trim(p_name), 'private')
    returning id into v_chat_id;

    insert into public.chat_members (chat_id, user_id, role)
    values (v_chat_id, auth.uid(), 'admin');

    foreach v_user_id in array p_user_ids loop
        if v_user_id <> auth.uid() then
            insert into public.chat_members (chat_id, user_id, role)
            values (v_chat_id, v_user_id, 'member')
            on conflict do nothing;
        end if;
    end loop;

    return v_chat_id;
end;
$$;

revoke all on function public.create_group_chat(text, uuid[]) from public;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;
