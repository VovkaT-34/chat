-- Apply a user's personal disappearing-message timer to all current messages in that chat.
-- Each user's personal expiry remains isolated; other participants keep their own visibility.

CREATE OR REPLACE FUNCTION public.set_chat_disappearing_settings(p_chat_id bigint,p_mode text,p_enabled boolean,p_duration_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=(SELECT auth.uid()); v_type text; v_is_group boolean; v_owner uuid; v_member_count integer;
BEGIN
 IF v_uid IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Пользователь не авторизован или аккаунт не одобрен'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('self','all') OR p_enabled IS NULL OR p_duration_seconds IS NULL
  OR p_duration_seconds NOT IN (30,300,3600,10800,86400,259200,604800) THEN
  RAISE EXCEPTION 'Некорректные параметры исчезающих сообщений'; END IF;
 SELECT c.type,c.is_group,c.created_by,(SELECT count(*)::integer FROM public.chat_members cm WHERE cm.chat_id=c.id)
 INTO v_type,v_is_group,v_owner,v_member_count FROM public.chats c WHERE c.id=p_chat_id;
 IF NOT FOUND OR v_type<>'private' THEN RAISE EXCEPTION 'Настройка доступна только в личных и групповых чатах'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=p_chat_id AND cm.user_id=v_uid) THEN RAISE EXCEPTION 'Нет доступа к этому чату'; END IF;
 IF NOT v_is_group AND v_member_count<>2 THEN RAISE EXCEPTION 'Настройка доступна только в личном чате один на один'; END IF;
 IF p_mode='all' THEN
  IF v_is_group AND v_owner IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Только владелец группы может управлять исчезновением для всех'; END IF;
  INSERT INTO public.chat_disappearing_settings(chat_id,enabled,duration_seconds,updated_by,updated_at)
  VALUES(p_chat_id,p_enabled,p_duration_seconds,v_uid,now())
  ON CONFLICT(chat_id) DO UPDATE SET enabled=EXCLUDED.enabled,duration_seconds=EXCLUDED.duration_seconds,updated_by=EXCLUDED.updated_by,updated_at=now();
 ELSE
  INSERT INTO public.user_chat_disappearing_settings(chat_id,user_id,enabled,duration_seconds,updated_at)
  VALUES(p_chat_id,v_uid,p_enabled,p_duration_seconds,now())
  ON CONFLICT(chat_id,user_id) DO UPDATE SET enabled=EXCLUDED.enabled,duration_seconds=EXCLUDED.duration_seconds,updated_at=now();

  IF p_enabled IS TRUE THEN
   INSERT INTO public.message_user_expirations(message_id,user_id,expires_at)
   SELECT m.id,v_uid,now()+make_interval(secs=>p_duration_seconds)
   FROM public.messages m
   WHERE m.chat_id=p_chat_id
   ON CONFLICT(message_id,user_id) DO UPDATE SET expires_at=EXCLUDED.expires_at;
  END IF;
 END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_chat_disappearing_settings(bigint,text,boolean,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_chat_disappearing_settings(bigint,text,boolean,integer) TO authenticated;
