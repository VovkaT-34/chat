-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

CREATE OR REPLACE FUNCTION public.get_my_chat_list_data(p_chat_ids bigint[])
RETURNS TABLE(chat_id bigint, unread_count bigint, last_message_id bigint, last_message_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Пользователь не авторизован';
    END IF;

    RETURN QUERY
    WITH requested AS (
        SELECT DISTINCT x AS chat_id
        FROM unnest(COALESCE(p_chat_ids, ARRAY[]::bigint[])) x
        JOIN public.chats c ON c.id = x
        WHERE x > 0
          AND (
              c.type = 'public'
              OR EXISTS (
                  SELECT 1 FROM public.chat_members cm
                  WHERE cm.chat_id = c.id AND cm.user_id = v_user_id
              )
          )
    ),
    unread AS (
        SELECT r.chat_id, COUNT(m.id)::bigint AS unread_count
        FROM requested r
        LEFT JOIN public.user_chat_reads ucr
          ON ucr.chat_id = r.chat_id AND ucr.user_id = v_user_id
        LEFT JOIN public.messages m
          ON m.chat_id = r.chat_id
         AND m.id > COALESCE(ucr.last_read_message_id, 0)
         AND m.user_id <> v_user_id
        GROUP BY r.chat_id
    ),
    latest AS (
        SELECT DISTINCT ON (m.chat_id) m.chat_id, m.id AS last_message_id
        FROM public.messages m
        JOIN requested r ON r.chat_id = m.chat_id
        WHERE m.user_id = v_user_id
        ORDER BY m.chat_id, m.created_at DESC, m.id DESC
    ),
    statuses AS (
        SELECT l.chat_id, l.last_message_id,
               public.get_message_status(l.last_message_id) AS last_message_status
        FROM latest l
    )
    SELECT r.chat_id,
           COALESCE(u.unread_count, 0)::bigint,
           s.last_message_id,
           s.last_message_status
    FROM requested r
    LEFT JOIN unread u ON u.chat_id = r.chat_id
    LEFT JOIN statuses s ON s.chat_id = r.chat_id
    ORDER BY r.chat_id;
END;
$function$;
