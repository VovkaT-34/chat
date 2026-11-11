-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

CREATE OR REPLACE FUNCTION public.get_my_unread_counts(p_chat_ids bigint[])
RETURNS TABLE(chat_id bigint, unread_count bigint)
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
                  SELECT 1
                  FROM public.chat_members cm
                  WHERE cm.chat_id = c.id
                    AND cm.user_id = v_user_id
              )
          )
    )
    SELECT r.chat_id,
           COUNT(m.id)::bigint AS unread_count
    FROM requested r
    LEFT JOIN public.user_chat_reads ucr
      ON ucr.chat_id = r.chat_id
     AND ucr.user_id = v_user_id
    LEFT JOIN public.messages m
      ON m.chat_id = r.chat_id
     AND m.id > COALESCE(ucr.last_read_message_id, 0)
     AND m.user_id <> v_user_id
    GROUP BY r.chat_id
    ORDER BY r.chat_id;
END;
$function$;
