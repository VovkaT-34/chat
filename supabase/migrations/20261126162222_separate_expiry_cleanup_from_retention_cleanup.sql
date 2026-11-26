-- Keep the existing hourly call-signal/public-retention cleanup hourly.
-- Expired private messages use a narrow indexed cleanup every minute.

CREATE OR REPLACE FUNCTION public.cleanup_old_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  DELETE FROM public.call_signals
  WHERE created_at < now() - interval '7 days';

  WITH old_public_messages AS (
    SELECT m.id
    FROM public.messages m
    JOIN public.chats c ON c.id = m.chat_id
    WHERE c.type = 'public'
      AND m.id NOT IN (
        SELECT recent.id
        FROM public.messages recent
        WHERE recent.chat_id = m.chat_id
        ORDER BY recent.created_at DESC, recent.id DESC
        LIMIT 150
      )
  )
  DELETE FROM public.messages m
  USING old_public_messages old
  WHERE m.id = old.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  DELETE FROM public.messages
  WHERE expires_at IS NOT NULL
    AND expires_at <= now();
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_old_messages() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_messages() TO postgres;
REVOKE ALL ON FUNCTION public.cleanup_expired_messages() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_messages() TO postgres;

SELECT cron.alter_job(1, schedule => '0 * * * *');
SELECT cron.schedule(
  'cleanup-expired-messages',
  '* * * * *',
  'SELECT public.cleanup_expired_messages();'
);
