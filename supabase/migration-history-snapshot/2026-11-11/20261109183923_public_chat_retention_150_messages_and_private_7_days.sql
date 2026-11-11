-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

CREATE OR REPLACE FUNCTION public.cleanup_old_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old_message_ids bigint[];
BEGIN
  /*
    Every public chat keeps its latest 150 messages.
    One-to-one and multi-user chats keep messages for exactly 7 days.
  */
  SELECT COALESCE(array_agg(candidate.id), ARRAY[]::bigint[])
  INTO v_old_message_ids
  FROM (
    SELECT m.id
    FROM public.messages AS m
    JOIN public.chats AS c ON c.id = m.chat_id
    WHERE
      (
        c.type = 'public'
        AND m.id NOT IN (
          SELECT recent.id
          FROM public.messages AS recent
          WHERE recent.chat_id = m.chat_id
          ORDER BY recent.created_at DESC, recent.id DESC
          LIMIT 150
        )
      )
      OR
      (
        c.type IS DISTINCT FROM 'public'
        AND m.created_at < now() - interval '7 days'
      )
  ) AS candidate;

  IF cardinality(v_old_message_ids) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.messages AS reply_msg
  SET reply_to = NULL
  WHERE reply_msg.reply_to = ANY(v_old_message_ids);

  DELETE FROM public.message_deliveries AS md
  WHERE md.message_id = ANY(v_old_message_ids);

  UPDATE public.user_chat_reads AS ucr
  SET last_read_message_id = NULL
  WHERE ucr.last_read_message_id = ANY(v_old_message_ids);

  DELETE FROM public.messages AS old_msg
  WHERE old_msg.id = ANY(v_old_message_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prune_public_chat_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old_message_ids bigint[];
BEGIN
  PERFORM 1
  FROM public.chats
  WHERE id = NEW.chat_id
    AND type = 'public'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(candidate.id), ARRAY[]::bigint[])
  INTO v_old_message_ids
  FROM (
    SELECT m.id
    FROM public.messages AS m
    WHERE m.chat_id = NEW.chat_id
      AND m.id NOT IN (
        SELECT recent.id
        FROM public.messages AS recent
        WHERE recent.chat_id = NEW.chat_id
        ORDER BY recent.created_at DESC, recent.id DESC
        LIMIT 150
      )
  ) AS candidate;

  IF cardinality(v_old_message_ids) > 0 THEN
    UPDATE public.messages AS reply_msg
    SET reply_to = NULL
    WHERE reply_msg.reply_to = ANY(v_old_message_ids);

    DELETE FROM public.message_deliveries AS md
    WHERE md.message_id = ANY(v_old_message_ids);

    UPDATE public.user_chat_reads AS ucr
    SET last_read_message_id = NULL
    WHERE ucr.last_read_message_id = ANY(v_old_message_ids);

    DELETE FROM public.messages AS old_msg
    WHERE old_msg.id = ANY(v_old_message_ids);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prune_public_chat_messages() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prune_public_chat_messages_after_insert ON public.messages;

CREATE TRIGGER prune_public_chat_messages_after_insert
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.prune_public_chat_messages();
