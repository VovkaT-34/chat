-- Emergency rollback for 20261111123000_harden_mutating_chat_rpcs.
-- Roll back 20261111130000_lock_profile_access.sql first; then run this; then stage 1 rollback.
-- Restores the original RPC bodies from the saved baseline.

begin;

create or replace function public.add_chat_member(p_chat_id bigint, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Пользователь не авторизован'; end if;
  if not exists(select 1 from public.chats c where c.id=p_chat_id and (c.created_by=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='superadmin'))) then
    raise exception 'Только создатель группы или суперадминистратор может добавлять пользователей';
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id and approved=true) then raise exception 'Пользователь не найден или не одобрен'; end if;
  insert into public.chat_members(chat_id,user_id,role) values(p_chat_id,p_user_id,'member') on conflict do nothing;
end;
$$;

create or replace function public.remove_chat_member(p_chat_id bigint, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Пользователь не авторизован'; end if;
  if not exists(select 1 from public.chats c where c.id=p_chat_id and (c.created_by=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='superadmin'))) then
    raise exception 'Только создатель группы или суперадминистратор может удалять пользователей';
  end if;
  if p_user_id=auth.uid() then raise exception 'Нельзя удалить самого себя'; end if;
  delete from public.chat_members where chat_id=p_chat_id and user_id=p_user_id;
end;
$$;

create or replace function public.rename_group_chat(p_chat_id bigint, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Пользователь не авторизован'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'Название группы не указано'; end if;
  if not exists (
    select 1 from public.chats c
    where c.id = p_chat_id
      and (c.created_by = auth.uid()
           or exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='superadmin'))
  ) then raise exception 'Нет прав на изменение названия группы'; end if;
  update public.chats set name=trim(p_name) where id=p_chat_id;
end;
$$;

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
  if v_user_id is null then raise exception 'Пользователь не авторизован'; end if;
  select c.type into v_chat_type from public.chats c where c.id = p_chat_id;
  if v_chat_type is null then raise exception 'Чат не найден'; end if;
  if v_chat_type = 'public' then raise exception 'Из общего чата выйти нельзя'; end if;
  delete from public.chat_members where chat_id = p_chat_id and user_id = v_user_id;
  return found;
end;
$$;

create or replace function public.mark_chat_read(p_chat_id bigint, p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_chat_id bigint;
  v_last bigint;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован'; end if;
  if not exists (select 1 from public.chats c where c.id=p_chat_id and (c.type='public' or exists(select 1 from public.chat_members cm where cm.chat_id=c.id and cm.user_id=v_uid))) then raise exception 'Нет доступа к этому чату'; end if;
  select chat_id into v_chat_id from public.messages where id=p_message_id;
  if v_chat_id is null or v_chat_id<>p_chat_id then raise exception 'Сообщение не найдено'; end if;
  insert into public.message_deliveries(message_id,user_id,delivered_at)
  select m.id,v_uid,now() from public.messages m where m.chat_id=p_chat_id and m.user_id<>v_uid and m.id<=p_message_id
  on conflict(message_id,user_id) do nothing;
  select last_read_message_id into v_last from public.user_chat_reads where user_id=v_uid and chat_id=p_chat_id;
  if coalesce(v_last,0) >= p_message_id then return; end if;
  insert into public.user_chat_reads(user_id,chat_id,last_read_message_id,updated_at)
  values(v_uid,p_chat_id,p_message_id,now())
  on conflict(user_id,chat_id) do update set last_read_message_id=greatest(coalesce(public.user_chat_reads.last_read_message_id,0),excluded.last_read_message_id),updated_at=now();
end;
$$;

create or replace function public.mark_message_delivered(p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_user_id uuid;
    v_chat_id bigint;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Пользователь не авторизован';
    END IF;
    SELECT chat_id INTO v_chat_id FROM public.messages WHERE id = p_message_id;
    IF v_chat_id IS NULL THEN
        RAISE EXCEPTION 'Сообщение не найдено';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.chats c
        WHERE c.id = v_chat_id
          AND (c.type = 'public' OR EXISTS (
            SELECT 1 FROM public.chat_members cm
            WHERE cm.chat_id = c.id AND cm.user_id = v_user_id
          ))
    ) THEN
        RAISE EXCEPTION 'Нет доступа к этому чату';
    END IF;
    IF EXISTS (SELECT 1 FROM public.messages WHERE id = p_message_id AND user_id = v_user_id) THEN
        RETURN;
    END IF;
    INSERT INTO public.message_deliveries(message_id,user_id)
    VALUES(p_message_id,v_user_id)
    ON CONFLICT(message_id,user_id) DO NOTHING;
END;
$$;

commit;
