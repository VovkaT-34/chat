-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

drop function if exists public.get_my_group_chats();

create function public.get_my_group_chats()
returns table(chat_id bigint, chat_name text, last_message_at timestamp with time zone, is_member boolean)
language sql security definer set search_path = public
as $$
 select c.id, c.name,
        (select max(m.created_at) from public.messages m where m.chat_id=c.id),
        exists(select 1 from public.chat_members cm where cm.chat_id=c.id and cm.user_id=auth.uid())
 from public.chats c
 where c.type='private'
   and (select count(*) from public.chat_members cm2 where cm2.chat_id=c.id) >= 3
   and (
     exists(select 1 from public.chat_members cm where cm.chat_id=c.id and cm.user_id=auth.uid())
     or exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='superadmin')
   )
 order by 3 desc nulls last, c.id desc;
$$;

create or replace function public.add_chat_member(p_chat_id bigint, p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Пользователь не авторизован'; end if;
 if not exists(select 1 from public.chats c where c.id=p_chat_id and (c.created_by=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='superadmin'))) then
   raise exception 'Только создатель группы или суперадминистратор может добавлять пользователей';
 end if;
 if not exists(select 1 from public.profiles where id=p_user_id and approved=true) then raise exception 'Пользователь не найден или не одобрен'; end if;
 insert into public.chat_members(chat_id,user_id,role) values(p_chat_id,p_user_id,'member') on conflict do nothing;
end; $$;

create or replace function public.remove_chat_member(p_chat_id bigint, p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Пользователь не авторизован'; end if;
 if not exists(select 1 from public.chats c where c.id=p_chat_id and (c.created_by=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='superadmin'))) then
   raise exception 'Только создатель группы или суперадминистратор может удалять пользователей';
 end if;
 if p_user_id=auth.uid() then raise exception 'Нельзя удалить самого себя'; end if;
 delete from public.chat_members where chat_id=p_chat_id and user_id=p_user_id;
end; $$;

drop function if exists public.delete_group_chat(bigint);
create function public.delete_group_chat(p_chat_id bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Пользователь не авторизован'; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='superadmin') then raise exception 'Только суперадминистратор может удалить группу'; end if;
 delete from public.chats where id=p_chat_id and type='private' and (select count(*) from public.chat_members cm where cm.chat_id=p_chat_id) >= 3;
end; $$;

grant execute on function public.get_my_group_chats() to authenticated;
grant execute on function public.add_chat_member(bigint,uuid) to authenticated;
grant execute on function public.remove_chat_member(bigint,uuid) to authenticated;
grant execute on function public.delete_group_chat(bigint) to authenticated;
