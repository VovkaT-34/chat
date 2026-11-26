-- Server-side disappearing messages and single-owner group lifecycle.
-- Public chats retain their existing last-150-message rule.
-- Private 1:1 chats and groups no longer expire by age alone.

ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false;
UPDATE public.chats c SET is_group=true
WHERE c.type='private' AND (SELECT count(*) FROM public.chat_members cm WHERE cm.chat_id=c.id)>=3;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.chat_disappearing_settings (
 chat_id bigint PRIMARY KEY REFERENCES public.chats(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 duration_seconds integer NOT NULL DEFAULT 604800 CHECK(duration_seconds IN (30,300,3600,10800,86400,259200,604800)),
 updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_chat_disappearing_settings (
 chat_id bigint NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 duration_seconds integer NOT NULL DEFAULT 604800 CHECK(duration_seconds IN (30,300,3600,10800,86400,259200,604800)),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(chat_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.message_user_expirations (
 message_id bigint NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(message_id,user_id)
);

ALTER TABLE public.chat_disappearing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_chat_disappearing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_user_expirations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_disappearing_settings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.user_chat_disappearing_settings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.message_user_expirations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.message_user_expirations TO authenticated;

CREATE POLICY authenticated_select_own_message_expirations
ON public.message_user_expirations FOR SELECT TO authenticated
USING(user_id=(SELECT auth.uid()) AND (SELECT public.is_approved_user()));

CREATE INDEX IF NOT EXISTS messages_expires_at_idx ON public.messages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_user_expirations_expires_at_idx ON public.message_user_expirations(expires_at);
CREATE INDEX IF NOT EXISTS message_user_expirations_user_message_idx ON public.message_user_expirations(user_id,message_id);

-- Personal expiry rows are retained as tombstones: expired messages stay hidden
-- from the selected user while remaining visible to other chat participants.
ALTER POLICY authenticated_select_messages ON public.messages USING (
 EXISTS(SELECT 1 FROM public.chats c WHERE c.id=messages.chat_id AND
  (c.type='public' OR EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=c.id AND cm.user_id=(SELECT auth.uid()))))
 AND (SELECT public.is_approved_user())
 AND (messages.expires_at IS NULL OR messages.expires_at>now())
 AND NOT EXISTS(SELECT 1 FROM public.message_user_expirations e WHERE e.message_id=messages.id AND e.user_id=(SELECT auth.uid()) AND e.expires_at<=now())
);

CREATE OR REPLACE FUNCTION public.set_message_global_disappearing_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_duration integer;
BEGIN
 NEW.expires_at:=NULL;
 SELECT s.duration_seconds INTO v_duration
 FROM public.chat_disappearing_settings s JOIN public.chats c ON c.id=s.chat_id
 WHERE s.chat_id=NEW.chat_id AND s.enabled IS TRUE AND c.type='private';
 IF FOUND THEN NEW.expires_at:=now()+make_interval(secs=>v_duration); END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_message_personal_expirations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 INSERT INTO public.message_user_expirations(message_id,user_id,expires_at)
 SELECT NEW.id,s.user_id,now()+make_interval(secs=>s.duration_seconds)
 FROM public.user_chat_disappearing_settings s
 JOIN public.chat_members cm ON cm.chat_id=s.chat_id AND cm.user_id=s.user_id
 JOIN public.chats c ON c.id=s.chat_id
 WHERE s.chat_id=NEW.chat_id AND s.enabled IS TRUE AND c.type='private'
 ON CONFLICT(message_id,user_id) DO UPDATE SET expires_at=EXCLUDED.expires_at;
 RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_message_global_disappearing_expiry_before_insert ON public.messages;
CREATE TRIGGER set_message_global_disappearing_expiry_before_insert BEFORE INSERT ON public.messages
 FOR EACH ROW EXECUTE FUNCTION public.set_message_global_disappearing_expiry();
DROP TRIGGER IF EXISTS create_message_personal_expirations_after_insert ON public.messages;
CREATE TRIGGER create_message_personal_expirations_after_insert AFTER INSERT ON public.messages
 FOR EACH ROW EXECUTE FUNCTION public.create_message_personal_expirations();
REVOKE ALL ON FUNCTION public.set_message_global_disappearing_expiry() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_message_personal_expirations() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_chat_disappearing_settings(p_chat_id bigint)
RETURNS TABLE(shared_enabled boolean,shared_duration_seconds integer,personal_enabled boolean,personal_duration_seconds integer,can_manage_shared boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_uid uuid:=(SELECT auth.uid()); v_type text; v_is_group boolean; v_owner uuid; v_member_count integer;
 v_shared_enabled boolean:=false; v_shared_duration integer:=604800;
 v_personal_enabled boolean:=false; v_personal_duration integer:=604800; v_can_manage_shared boolean:=false;
BEGIN
 IF v_uid IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Пользователь не авторизован или аккаунт не одобрен'; END IF;
 SELECT c.type,c.is_group,c.created_by,(SELECT count(*)::integer FROM public.chat_members cm WHERE cm.chat_id=c.id)
 INTO v_type,v_is_group,v_owner,v_member_count FROM public.chats c WHERE c.id=p_chat_id;
 IF NOT FOUND OR v_type<>'private' THEN RAISE EXCEPTION 'Настройка доступна только в личных и групповых чатах'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=p_chat_id AND cm.user_id=v_uid) THEN RAISE EXCEPTION 'Нет доступа к этому чату'; END IF;
 IF NOT v_is_group AND v_member_count<>2 THEN RAISE EXCEPTION 'Настройка доступна только в личном чате один на один'; END IF;
 v_can_manage_shared:=(NOT v_is_group AND v_member_count=2) OR (v_is_group AND v_owner=v_uid);
 SELECT s.enabled,s.duration_seconds INTO v_shared_enabled,v_shared_duration FROM public.chat_disappearing_settings s WHERE s.chat_id=p_chat_id;
 SELECT s.enabled,s.duration_seconds INTO v_personal_enabled,v_personal_duration FROM public.user_chat_disappearing_settings s WHERE s.chat_id=p_chat_id AND s.user_id=v_uid;
 RETURN QUERY SELECT COALESCE(v_shared_enabled,false),COALESCE(v_shared_duration,604800),COALESCE(v_personal_enabled,false),COALESCE(v_personal_duration,604800),v_can_manage_shared;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_chat_disappearing_settings(p_chat_id bigint,p_mode text,p_enabled boolean,p_duration_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=(SELECT auth.uid()); v_type text; v_is_group boolean; v_owner uuid; v_member_count integer;
BEGIN
 IF v_uid IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Пользователь не авторизован или аккаунт не одобрен'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('self','all') OR p_enabled IS NULL OR p_duration_seconds IS NULL
  OR p_duration_seconds NOT IN (30,300,3600,10800,86400,259200,604800) THEN
  RAISE EXCEPTION 'Некорректные параметры исчезающих сообщений';
 END IF;
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
 END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_chat_disappearing_settings(bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.set_chat_disappearing_settings(bigint,text,boolean,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_chat_disappearing_settings(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_disappearing_settings(bigint,text,boolean,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_private_chat(p_other_user_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_current_user_id uuid:=(SELECT auth.uid()); v_chat_id bigint;
BEGIN
 IF v_current_user_id IS NULL THEN RAISE EXCEPTION 'Пользователь не авторизован'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_current_user_id AND approved IS TRUE) THEN RAISE EXCEPTION 'Аккаунт не одобрен'; END IF;
 IF v_current_user_id=p_other_user_id THEN RAISE EXCEPTION 'Нельзя создать личный чат с самим собой'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_other_user_id AND approved IS TRUE) THEN RAISE EXCEPTION 'Пользователь не найден или не одобрен'; END IF;
 SELECT cm1.chat_id INTO v_chat_id FROM public.chat_members cm1
 JOIN public.chat_members cm2 ON cm2.chat_id=cm1.chat_id JOIN public.chats c ON c.id=cm1.chat_id
 WHERE cm1.user_id=v_current_user_id AND cm2.user_id=p_other_user_id AND c.type='private' AND c.is_group IS FALSE
 AND (SELECT count(*) FROM public.chat_members cm3 WHERE cm3.chat_id=cm1.chat_id)=2 LIMIT 1;
 IF v_chat_id IS NOT NULL THEN RETURN v_chat_id; END IF;
 INSERT INTO public.chats(name,type,is_group) VALUES('Личный чат','private',false) RETURNING id INTO v_chat_id;
 INSERT INTO public.chat_members(chat_id,user_id) VALUES(v_chat_id,v_current_user_id),(v_chat_id,p_other_user_id);
 RETURN v_chat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_group_chat(p_name text,p_user_ids uuid[])
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_chat_id bigint; v_user_id uuid; v_role text; v_requested_count integer; v_valid_count integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Пользователь не авторизован'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid() AND approved IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Пользователь не найден или не одобрен'; END IF;
 IF p_name IS NULL OR trim(p_name)='' THEN RAISE EXCEPTION 'Название группы не указано'; END IF;
 IF p_user_ids IS NULL THEN RAISE EXCEPTION 'Не выбраны пользователи'; END IF;
 SELECT count(DISTINCT u)::integer INTO v_requested_count FROM unnest(p_user_ids) AS u WHERE u IS NOT NULL AND u<>auth.uid();
 IF v_requested_count<2 THEN RAISE EXCEPTION 'Для группового чата нужно минимум 2 других пользователя'; END IF;
 SELECT count(DISTINCT u)::integer INTO v_valid_count FROM unnest(p_user_ids) AS u JOIN public.profiles p ON p.id=u WHERE u<>auth.uid() AND p.approved IS TRUE;
 IF v_valid_count<>v_requested_count THEN RAISE EXCEPTION 'Один или несколько пользователей не найдены или не одобрены'; END IF;
 INSERT INTO public.chats(name,type,created_by,is_group) VALUES(trim(p_name),'private',auth.uid(),true) RETURNING id INTO v_chat_id;
 INSERT INTO public.chat_members(chat_id,user_id,role) VALUES(v_chat_id,auth.uid(),'admin');
 FOR v_user_id IN SELECT DISTINCT u FROM unnest(p_user_ids) AS u WHERE u IS NOT NULL AND u<>auth.uid()
 LOOP
  INSERT INTO public.chat_members(chat_id,user_id,role) VALUES(v_chat_id,v_user_id,'member') ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN v_chat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_group_chats()
RETURNS TABLE(chat_id bigint,chat_name text,last_message_at timestamptz,is_member boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $function$
 SELECT c.id,c.name,(SELECT max(m.created_at) FROM public.messages m WHERE m.chat_id=c.id),
 EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=c.id AND cm.user_id=auth.uid())
 FROM public.chats c
 WHERE auth.uid() IS NOT NULL AND public.is_approved_user() AND c.type='private' AND c.is_group IS TRUE
 AND (EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=c.id AND cm.user_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.approved IS TRUE AND p.role='superadmin'))
 ORDER BY 3 DESC NULLS LAST,c.id DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_private_chats()
RETURNS TABLE(chat_id bigint,chat_name text,last_message_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $function$
 SELECT c.id,COALESCE((SELECT p.username FROM public.chat_members cm2 JOIN public.profiles p ON p.id=cm2.user_id WHERE cm2.chat_id=c.id AND cm2.user_id<>auth.uid() LIMIT 1),'Личный чат'),
 (SELECT max(m.created_at) FROM public.messages m WHERE m.chat_id=c.id)
 FROM public.chats c JOIN public.chat_members cm ON cm.chat_id=c.id
 WHERE auth.uid() IS NOT NULL AND public.is_approved_user() AND cm.user_id=auth.uid()
 AND c.type='private' AND c.is_group IS FALSE
 AND (SELECT count(*) FROM public.chat_members cm3 WHERE cm3.chat_id=c.id)=2
 ORDER BY 3 DESC NULLS LAST,c.id DESC;
$function$;

DROP FUNCTION public.leave_chat(bigint);
CREATE FUNCTION public.leave_chat(p_chat_id bigint,p_transfer_to_user_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=(SELECT auth.uid()); v_type text; v_is_group boolean; v_owner uuid; v_transfer_user_id uuid;
BEGIN
 IF v_uid IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Пользователь не авторизован или аккаунт не одобрен'; END IF;
 SELECT c.type,c.is_group,c.created_by INTO v_type,v_is_group,v_owner FROM public.chats c WHERE c.id=p_chat_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Чат не найден'; END IF;
 IF v_type='public' THEN RAISE EXCEPTION 'Из общего чата выйти нельзя'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=p_chat_id AND cm.user_id=v_uid) THEN RAISE EXCEPTION 'Вы не состоите в этом чате'; END IF;
 IF v_is_group IS TRUE AND v_owner=v_uid THEN
  IF p_transfer_to_user_id IS NULL OR p_transfer_to_user_id=v_uid THEN RAISE EXCEPTION 'Перед выходом необходимо передать управление участнику группы'; END IF;
  SELECT cm.user_id INTO v_transfer_user_id FROM public.chat_members cm JOIN public.profiles p ON p.id=cm.user_id
  WHERE cm.chat_id=p_chat_id AND cm.user_id=p_transfer_to_user_id AND p.approved IS TRUE FOR UPDATE OF cm;
  IF NOT FOUND THEN RAISE EXCEPTION 'Выбранный пользователь больше не состоит в группе или не одобрен'; END IF;
  UPDATE public.chat_members SET role='member' WHERE chat_id=p_chat_id AND role='admin';
  UPDATE public.chat_members SET role='admin' WHERE chat_id=p_chat_id AND user_id=v_transfer_user_id;
  UPDATE public.chats SET created_by=v_transfer_user_id WHERE id=p_chat_id;
 ELSIF p_transfer_to_user_id IS NOT NULL THEN
  RAISE EXCEPTION 'Передавать управление может только владелец группы';
 END IF;
 DELETE FROM public.chat_members WHERE chat_id=p_chat_id AND user_id=v_uid;
 RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.leave_chat(bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.leave_chat(bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_group_chat(p_chat_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_owner uuid; v_is_group boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Пользователь не авторизован или аккаунт не одобрен'; END IF;
 SELECT c.created_by,c.is_group INTO v_owner,v_is_group FROM public.chats c WHERE c.id=p_chat_id FOR UPDATE;
 IF NOT FOUND OR v_is_group IS DISTINCT FROM TRUE OR v_owner IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Только владелец группы может удалить группу'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=p_chat_id AND cm.user_id=auth.uid()) THEN RAISE EXCEPTION 'Владелец должен состоять в группе для её удаления'; END IF;
 DELETE FROM public.messages WHERE chat_id=p_chat_id;
 DELETE FROM public.chat_members WHERE chat_id=p_chat_id;
 DELETE FROM public.user_chat_reads WHERE chat_id=p_chat_id;
 DELETE FROM public.chat_notification_settings WHERE chat_id=p_chat_id;
 DELETE FROM public.call_signals WHERE chat_id=p_chat_id;
 DELETE FROM public.chats WHERE id=p_chat_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_group_chat(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delete_group_chat(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_old_messages()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 DELETE FROM public.call_signals WHERE created_at<now()-interval '7 days';
 DELETE FROM public.messages WHERE expires_at IS NOT NULL AND expires_at<=now();
 WITH old_public_messages AS (
  SELECT m.id FROM public.messages m JOIN public.chats c ON c.id=m.chat_id
  WHERE c.type='public' AND m.id NOT IN (
   SELECT recent.id FROM public.messages recent WHERE recent.chat_id=m.chat_id
   ORDER BY recent.created_at DESC,recent.id DESC LIMIT 150
  )
 )
 DELETE FROM public.messages m USING old_public_messages old WHERE m.id=old.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.cleanup_old_messages() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_messages() TO postgres;

SELECT cron.alter_job(1,schedule=>'* * * * *');
NOTIFY pgrst,'reload schema';
