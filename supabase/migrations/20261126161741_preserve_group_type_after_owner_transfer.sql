-- Keep groups classified as groups after their member count falls to two.
-- Serialize membership mutations with group deletion and ownership transfer.

CREATE OR REPLACE FUNCTION public.get_private_chat_peer(p_chat_id bigint)
RETURNS TABLE(user_id uuid, username text)
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.id,p.username
  FROM public.chat_members cm
  JOIN public.profiles p ON p.id=cm.user_id
  JOIN public.chats c ON c.id=cm.chat_id
  WHERE cm.chat_id=p_chat_id
    AND c.type='private'
    AND c.is_group IS FALSE
    AND cm.user_id<>auth.uid()
    AND public.is_approved_user()
    AND EXISTS(SELECT 1 FROM public.chat_members own WHERE own.chat_id=p_chat_id AND own.user_id=auth.uid())
    AND (SELECT count(*) FROM public.chat_members all_members WHERE all_members.chat_id=p_chat_id)=2
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_messages_for_superadmin(
 p_chat_id bigint,p_before_id bigint DEFAULT NULL,p_limit integer DEFAULT 10
)
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
 RETURN QUERY
 SELECT m.id,m.user_id,m.text,m.created_at,m.reply_to,p.username,rm.text AS reply_text,rp.username AS reply_username
 FROM public.messages m
 LEFT JOIN public.profiles p ON p.id=m.user_id
 LEFT JOIN public.messages rm ON rm.id=m.reply_to
 LEFT JOIN public.profiles rp ON rp.id=rm.user_id
 WHERE m.chat_id=p_chat_id AND (p_before_id IS NULL OR m.id<p_before_id)
 ORDER BY m.id DESC
 LIMIT greatest(1,least(p_limit,100));
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_chat_member(p_chat_id bigint,p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Пользователь не авторизован'; END IF;
 IF NOT public.is_approved_user() THEN RAISE EXCEPTION 'Аккаунт не одобрен'; END IF;
 PERFORM 1 FROM public.chats c WHERE c.id=p_chat_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Группа не найдена'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chats c WHERE c.id=p_chat_id AND (
  c.created_by=auth.uid() OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.approved IS TRUE AND p.role='superadmin')
 )) THEN RAISE EXCEPTION 'Только создатель группы или суперадминистратор может добавлять пользователей'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND approved IS TRUE) THEN
  RAISE EXCEPTION 'Пользователь не найден или не одобрен';
 END IF;
 INSERT INTO public.chat_members(chat_id,user_id,role) VALUES(p_chat_id,p_user_id,'member') ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_chat_member(p_chat_id bigint,p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Пользователь не авторизован'; END IF;
 IF NOT public.is_approved_user() THEN RAISE EXCEPTION 'Аккаунт не одобрен'; END IF;
 PERFORM 1 FROM public.chats c WHERE c.id=p_chat_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Группа не найдена'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chats c WHERE c.id=p_chat_id AND (
  c.created_by=auth.uid() OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.approved IS TRUE AND p.role='superadmin')
 )) THEN RAISE EXCEPTION 'Только создатель группы или суперадминистратор может удалять пользователей'; END IF;
 IF p_user_id=auth.uid() THEN RAISE EXCEPTION 'Нельзя удалить самого себя'; END IF;
 DELETE FROM public.chat_members WHERE chat_id=p_chat_id AND user_id=p_user_id;
END;
$function$;

NOTIFY pgrst,'reload schema';