-- A former member must not keep querying delivery/read state for messages
-- from a private or group chat after leaving it. Public-chat behavior is kept.
CREATE OR REPLACE FUNCTION public.get_message_read_status(p_message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
    v_chat_id bigint;
    v_message_user_id uuid;
    v_chat_type text;
    v_is_read boolean := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Пользователь не авторизован';
    END IF;
    IF NOT public.is_approved_user() THEN
        RAISE EXCEPTION 'Аккаунт не одобрен';
    END IF;

    SELECT m.chat_id, m.user_id, c.type
    INTO v_chat_id, v_message_user_id, v_chat_type
    FROM public.messages m
    JOIN public.chats c ON c.id = m.chat_id
    WHERE m.id = p_message_id;

    IF v_chat_id IS NULL THEN
        RAISE EXCEPTION 'Сообщение не найдено';
    END IF;

    IF v_message_user_id <> v_user_id THEN
        RAISE EXCEPTION 'Нет доступа к статусу сообщения';
    END IF;

    IF v_chat_type IS DISTINCT FROM 'public'
       AND NOT EXISTS (
           SELECT 1 FROM public.chat_members cm
           WHERE cm.chat_id = v_chat_id AND cm.user_id = v_user_id
       ) THEN
        RAISE EXCEPTION 'Нет доступа к статусу сообщения';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.chat_members cm
        WHERE cm.chat_id = v_chat_id AND cm.user_id <> v_user_id
    ) THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.chat_members cm
            JOIN public.user_chat_reads r
              ON r.chat_id = cm.chat_id AND r.user_id = cm.user_id
            WHERE cm.chat_id = v_chat_id
              AND cm.user_id <> v_user_id
              AND r.last_read_message_id >= p_message_id
        ) INTO v_is_read;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.user_chat_reads r
            WHERE r.chat_id = v_chat_id
              AND r.user_id <> v_user_id
              AND r.last_read_message_id >= p_message_id
        ) INTO v_is_read;
    END IF;
    RETURN v_is_read;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_message_status(p_message_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
    v_sender_id uuid;
    v_chat_id bigint;
    v_chat_type text;
    v_recipient_count integer;
    v_delivered_count integer;
    v_read_count integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR NOT public.is_approved_user() THEN
        RETURN 'none';
    END IF;

    SELECT m.user_id, m.chat_id, c.type
    INTO v_sender_id, v_chat_id, v_chat_type
    FROM public.messages m
    JOIN public.chats c ON c.id = m.chat_id
    WHERE m.id = p_message_id;

    IF v_chat_id IS NULL OR v_sender_id <> v_user_id THEN
        RETURN 'none';
    END IF;

    IF v_chat_type IS DISTINCT FROM 'public'
       AND NOT EXISTS (
           SELECT 1 FROM public.chat_members cm
           WHERE cm.chat_id = v_chat_id AND cm.user_id = v_user_id
       ) THEN
        RETURN 'none';
    END IF;

    IF v_chat_type = 'public' THEN
        SELECT COUNT(*) INTO v_delivered_count
        FROM public.message_deliveries md
        WHERE md.message_id = p_message_id AND md.user_id <> v_sender_id;

        SELECT COUNT(*) INTO v_read_count
        FROM public.user_chat_reads ucr
        WHERE ucr.chat_id = v_chat_id
          AND ucr.user_id <> v_sender_id
          AND ucr.last_read_message_id >= p_message_id;

        IF v_read_count > 0 THEN RETURN 'read'; END IF;
        IF v_delivered_count > 0 THEN RETURN 'delivered'; END IF;
        RETURN 'sent';
    END IF;

    SELECT COUNT(*) INTO v_recipient_count
    FROM public.chat_members
    WHERE chat_id = v_chat_id AND user_id <> v_sender_id;

    SELECT COUNT(*) INTO v_delivered_count
    FROM public.message_deliveries md
    JOIN public.chat_members cm
      ON cm.chat_id = v_chat_id AND cm.user_id = md.user_id
    WHERE md.message_id = p_message_id AND md.user_id <> v_sender_id;

    SELECT COUNT(*) INTO v_read_count
    FROM public.chat_members cm
    JOIN public.user_chat_reads ucr
      ON ucr.chat_id = cm.chat_id AND ucr.user_id = cm.user_id
    WHERE cm.chat_id = v_chat_id
      AND cm.user_id <> v_sender_id
      AND ucr.last_read_message_id >= p_message_id;

    IF v_recipient_count = 0 THEN RETURN 'sent'; END IF;
    IF v_read_count > 0 THEN RETURN 'read'; END IF;
    IF v_delivered_count > 0 THEN RETURN 'delivered'; END IF;
    RETURN 'sent';
END;
$function$;
