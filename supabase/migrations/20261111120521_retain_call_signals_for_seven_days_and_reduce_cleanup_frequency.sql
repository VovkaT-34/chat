-- Call signalling is transient WebRTC state, not chat history.
-- Keep only seven days so abandoned offers/ICE candidates do not accumulate.
CREATE INDEX IF NOT EXISTS call_signals_created_at_idx
ON public.call_signals (created_at);

CREATE OR REPLACE FUNCTION public.cleanup_old_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old_message_ids bigint[];
BEGIN
  DELETE FROM public.call_signals
  WHERE created_at < now() - interval '7 days';

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

-- Hourly cleanup is sufficient: public chats are pruned immediately by
-- prune_public_chat_messages_after_insert; private history has a 7-day TTL.
SELECT cron.alter_job(1, schedule => '0 * * * *');

-- Purge already-expired transient signalling rows immediately.
DELETE FROM public.call_signals
WHERE created_at < now() - interval '7 days';
