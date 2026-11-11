-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,username,email,approved,role) values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),split_part(coalesce(new.email,''),'@',1)),coalesce(new.email,''),false,'user') on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.handle_new_user_profile();

drop function if exists public.get_my_private_chats();
create function public.get_my_private_chats()
returns table(chat_id bigint,chat_name text,last_message_at timestamptz)
language sql security definer set search_path=public as $$
 select c.id,
 coalesce((select p.username from public.chat_members cm2 join public.profiles p on p.id=cm2.user_id where cm2.chat_id=c.id and cm2.user_id<>auth.uid() limit 1),'Личный чат'),
 (select max(m.created_at) from public.messages m where m.chat_id=c.id)
 from public.chats c join public.chat_members cm on cm.chat_id=c.id
 where auth.uid() is not null and cm.user_id=auth.uid() and c.type='private'
 and (select count(*) from public.chat_members cm3 where cm3.chat_id=c.id)=2
 order by 3 desc nulls last,c.id desc;
$$;

create or replace function public.create_private_chat(p_other_user_id uuid)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_current_user_id uuid:=auth.uid(); v_chat_id bigint;
begin
 if v_current_user_id is null then raise exception 'Пользователь не авторизован'; end if;
 if v_current_user_id=p_other_user_id then raise exception 'Нельзя создать личный чат с самим собой'; end if;
 if not exists(select 1 from public.profiles where id=p_other_user_id and approved=true) then raise exception 'Пользователь не найден'; end if;
 select cm1.chat_id into v_chat_id from public.chat_members cm1 join public.chat_members cm2 on cm2.chat_id=cm1.chat_id join public.chats c on c.id=cm1.chat_id where cm1.user_id=v_current_user_id and cm2.user_id=p_other_user_id and c.type='private' and (select count(*) from public.chat_members cm3 where cm3.chat_id=cm1.chat_id)=2 limit 1;
 if v_chat_id is not null then return v_chat_id; end if;
 insert into public.chats(name,type) values('Личный чат','private') returning id into v_chat_id;
 insert into public.chat_members(chat_id,user_id) values(v_chat_id,v_current_user_id),(v_chat_id,p_other_user_id);
 return v_chat_id;
end; $$;

update public.chats c set type='private' where c.name='Личный чат' and c.type='public' and (select count(*) from public.chat_members cm where cm.chat_id=c.id)=2;
