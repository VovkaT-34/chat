-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.leave_chat(p_chat_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_chat_type text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Пользователь не авторизован';
    end if;

    select c.type into v_chat_type
    from public.chats c
    where c.id = p_chat_id;

    if v_chat_type is null then
        raise exception 'Чат не найден';
    end if;

    if v_chat_type = 'public' then
        raise exception 'Из общего чата выйти нельзя';
    end if;

    delete from public.chat_members
    where chat_id = p_chat_id
      and user_id = v_user_id;

    return found;
end;
$$;

grant execute on function public.leave_chat(bigint) to authenticated;
