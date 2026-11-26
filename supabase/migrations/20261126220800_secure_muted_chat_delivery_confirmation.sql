CREATE OR REPLACE FUNCTION public.mark_muted_chat_messages_delivered()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Пользователь не авторизован';
  END IF;

  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Аккаунт не одобрен';
  END IF;

  INSERT INTO public.message_deliveries (message_id, user_id, delivered_at)
  SELECT m.id, v_uid, now()
  FROM public.messages m
  JOIN public.chat_notification_settings s
    ON s.user_id = v_uid
   AND s.chat_id = m.chat_id
   AND s.push_enabled = false
  JOIN public.chat_members cm
    ON cm.chat_id = m.chat_id
   AND cm.user_id = v_uid
  LEFT JOIN public.user_chat_reads r
    ON r.user_id = v_uid
   AND r.chat_id = m.chat_id
  WHERE m.user_id <> v_uid
    AND m.id > COALESCE(r.last_read_message_id, 0)
  ON CONFLICT (message_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_muted_chat_messages_delivered() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_muted_chat_messages_delivered() TO authenticated;
