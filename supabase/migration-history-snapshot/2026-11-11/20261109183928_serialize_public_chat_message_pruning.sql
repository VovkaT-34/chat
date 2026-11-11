-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

CREATE OR REPLACE FUNCTION public.prune_public_chat_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old_message_ids bigint[];
BEGIN
  -- Serialize pruning per chat without locking the referenced chat row.
  PERFORM pg_advisory_xact_lock(NEW.chat_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.chats
    WHERE id = NEW.chat_id
      AND type = 'public'
  ) THEN
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
