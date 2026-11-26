-- Apply the same visibility rule to chat previews and unread counters.
-- One helper centralizes global and per-user expiry checks.

CREATE OR REPLACE FUNCTION public.message_visible_to_current_user(
 p_message_id bigint,p_global_expires_at timestamptz
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT auth.uid() IS NOT NULL
  AND (p_global_expires_at IS NULL OR p_global_expires_at>now())
  AND NOT EXISTS(
   SELECT 1 FROM public.message_user_expirations e
   WHERE e.message_id=p_message_id AND e.user_id=(SELECT auth.uid()) AND e.expires_at<=now()
  );
$function$;

REVOKE ALL ON FUNCTION public.message_visible_to_current_user(bigint,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.message_visible_to_current_user(bigint,timestamptz) TO authenticated;

ALTER POLICY authenticated_select_messages ON public.messages USING (
 EXISTS(SELECT 1 FROM public.chats c WHERE c.id=messages.chat_id AND
  (c.type='public' OR EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=c.id AND cm.user_id=(SELECT auth.uid()))))
 AND (SELECT public.is_approved_user())
 AND public.message_visible_to_current_user(messages.id,messages.expires_at)
);

CREATE OR REPLACE FUNCTION public.get_my_chat_list_data(p_chat_ids bigint[])
RETURNS TABLE(chat_id bigint,unread_count bigint,last_message_id bigint,last_message_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_user_id uuid:=auth.uid();
BEGIN
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Пользователь не авторизован'; END IF;
 IF NOT public.is_approved_user() THEN RAISE EXCEPTION 'Аккаунт не одобрен'; END IF;
 RETURN QUERY
 WITH requested AS (
  SELECT DISTINCT x AS chat_id FROM unnest(COALESCE(p_chat_ids,ARRAY[]::bigint[])) x
  JOIN public.chats c ON c.id=x WHERE x>0 AND (c.type='public' OR EXISTS(
   SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=c.id AND cm.user_id=v_user_id))
 ), unread AS (
  SELECT r.chat_id,COUNT(m.id)::bigint AS unread_count FROM requested r
  LEFT JOIN public.user_chat_reads ucr ON ucr.chat_id=r.chat_id AND ucr.user_id=v_user_id
  LEFT JOIN public.messages m ON m.chat_id=r.chat_id AND m.id>COALESCE(ucr.last_read_message_id,0)
   AND m.user_id<>v_user_id AND public.message_visible_to_current_user(m.id,m.expires_at)
  GROUP BY r.chat_id
 ), latest AS (
  SELECT DISTINCT ON(m.chat_id) m.chat_id,m.id AS last_message_id
  FROM public.messages m JOIN requested r ON r.chat_id=m.chat_id
  WHERE m.user_id=v_user_id AND public.message_visible_to_current_user(m.id,m.expires_at)
  ORDER BY m.chat_id,m.created_at DESC,m.id DESC
 ), statuses AS (
  SELECT l.chat_id,l.last_message_id,public.get_message_status(l.last_message_id) AS last_message_status FROM latest l
 )
 SELECT r.chat_id,COALESCE(u.unread_count,0)::bigint,s.last_message_id,s.last_message_status
 FROM requested r LEFT JOIN unread u ON u.chat_id=r.chat_id LEFT JOIN statuses s ON s.chat_id=r.chat_id
 ORDER BY r.chat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_unread_counts()
RETURNS TABLE(chat_id bigint,unread_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $function$
 SELECT c.id,COUNT(m.id)
 FROM public.chats c JOIN public.messages m ON m.chat_id=c.id
 LEFT JOIN public.user_chat_reads r ON r.user_id=auth.uid() AND r.chat_id=c.id
 WHERE auth.uid() IS NOT NULL AND public.is_approved_user()
  AND m.id>COALESCE(r.last_read_message_id,0) AND m.user_id<>auth.uid()
  AND public.message_visible_to_current_user(m.id,m.expires_at)
  AND (c.type='public' OR EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=c.id AND cm.user_id=auth.uid()))
 GROUP BY c.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_unread_counts(p_chat_ids bigint[])
RETURNS TABLE(chat_id bigint,unread_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_user_id uuid:=auth.uid();
BEGIN
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Пользователь не авторизован'; END IF;
 IF NOT public.is_approved_user() THEN RAISE EXCEPTION 'Аккаунт не одобрен'; END IF;
 RETURN QUERY
 WITH requested AS (
  SELECT DISTINCT x AS chat_id FROM unnest(COALESCE(p_chat_ids,ARRAY[]::bigint[])) x
  JOIN public.chats c ON c.id=x WHERE x>0 AND (c.type='public' OR EXISTS(
   SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=c.id AND cm.user_id=v_user_id))
 )
 SELECT r.chat_id,COUNT(m.id)::bigint FROM requested r
 LEFT JOIN public.user_chat_reads ucr ON ucr.chat_id=r.chat_id AND ucr.user_id=v_user_id
 LEFT JOIN public.messages m ON m.chat_id=r.chat_id AND m.id>COALESCE(ucr.last_read_message_id,0)
  AND m.user_id<>v_user_id AND public.message_visible_to_current_user(m.id,m.expires_at)
 GROUP BY r.chat_id ORDER BY r.chat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_unread_messages_count(p_user_id uuid,p_chat_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_count bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Пользователь не авторизован'; END IF;
 IF NOT public.is_approved_user() THEN RAISE EXCEPTION 'Аккаунт не одобрен'; END IF;
 IF auth.uid()<>p_user_id THEN RAISE EXCEPTION 'Недопустимый пользователь'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chats c WHERE c.id=p_chat_id AND
  (c.type='public' OR EXISTS(SELECT 1 FROM public.chat_members cm WHERE cm.chat_id=c.id AND cm.user_id=auth.uid()))) THEN
  RAISE EXCEPTION 'Нет доступа к этому чату';
 END IF;
 SELECT COUNT(*) INTO v_count FROM public.messages m
 LEFT JOIN public.user_chat_reads r ON r.user_id=p_user_id AND r.chat_id=p_chat_id
 WHERE m.chat_id=p_chat_id AND m.id>COALESCE(r.last_read_message_id,0)
  AND m.user_id<>p_user_id AND public.message_visible_to_current_user(m.id,m.expires_at);
 RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_group_chats()
RETURNS TABLE(chat_id bigint,chat_name text,last_message_at timestamptz,is_member boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $function$
 SELECT c.id,c.name,
  (SELECT max(m.created_at) FROM public.messages m WHERE m.chat_id=c.id AND public.message_visible_to_current_user(m.id,m.expires_at)),
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
 SELECT c.id,
  COALESCE((SELECT p.username FROM public.chat_members cm2 JOIN public.profiles p ON p.id=cm2.user_id
   WHERE cm2.chat_id=c.id AND cm2.user_id<>auth.uid() LIMIT 1),'Личный чат'),
  (SELECT max(m.created_at) FROM public.messages m WHERE m.chat_id=c.id AND public.message_visible_to_current_user(m.id,m.expires_at))
 FROM public.chats c JOIN public.chat_members cm ON cm.chat_id=c.id
 WHERE auth.uid() IS NOT NULL AND public.is_approved_user() AND cm.user_id=auth.uid()
  AND c.type='private' AND c.is_group IS FALSE
  AND (SELECT count(*) FROM public.chat_members cm3 WHERE cm3.chat_id=c.id)=2
 ORDER BY 3 DESC NULLS LAST,c.id DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_messages_for_superadmin(p_chat_id bigint,p_before_id bigint DEFAULT NULL,p_limit integer DEFAULT 10)
RETURNS TABLE(id bigint,user_id uuid,text text,created_at timestamptz,reply_to bigint,username text,reply_text text,reply_username text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='superadmin' AND p.approved=true) THEN
  RAISE EXCEPTION 'Только супер администратор может просматривать сообщения этой группы';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chats c WHERE c.id=p_chat_id AND c.type='private' AND c.is_group IS TRUE) THEN
  RAISE EXCEPTION 'Группа не найдена';
 END IF;
 RETURN QUERY SELECT m.id,m.user_id,m.text,m.created_at,m.reply_to,p.username,rm.text AS reply_text,rp.username AS reply_username
 FROM public.messages m LEFT JOIN public.profiles p ON p.id=m.user_id
 LEFT JOIN public.messages rm ON rm.id=m.reply_to LEFT JOIN public.profiles rp ON rp.id=rm.user_id
 WHERE m.chat_id=p_chat_id AND (p_before_id IS NULL OR m.id<p_before_id)
  AND public.message_visible_to_current_user(m.id,m.expires_at)
 ORDER BY m.id DESC LIMIT greatest(1,least(p_limit,100));
END;
$function$;

NOTIFY pgrst,'reload schema';
