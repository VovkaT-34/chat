-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

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
revoke execute on function public.mark_chat_read(bigint,bigint) from public;
grant execute on function public.mark_chat_read(bigint,bigint) to authenticated;
