-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.remove_chat_member(p_chat_id bigint, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    if auth.uid() is null then
        raise exception 'Пользователь не авторизован';
    end if;

    if not exists (
        select 1 from public.chat_members
        where chat_id = p_chat_id and user_id = auth.uid() and role = 'admin'
    ) then
        raise exception 'Только администратор может удалять пользователей';
    end if;

    if p_user_id = auth.uid() then
        raise exception 'Администратор не может удалить самого себя';
    end if;

    delete from public.chat_members
    where chat_id = p_chat_id and user_id = p_user_id;
end;
$function$;

revoke execute on function public.remove_chat_member(bigint, uuid) from public;
grant execute on function public.remove_chat_member(bigint, uuid) to authenticated;
