-- Set the shared disappearing-message timer to 7 days for all private 1:1 and group chats.
-- Public chats are excluded and keep their existing 150-message retention rule.

ALTER TABLE public.chat_disappearing_settings
  ALTER COLUMN enabled SET DEFAULT TRUE,
  ALTER COLUMN duration_seconds SET DEFAULT 604800;

INSERT INTO public.chat_disappearing_settings (
  chat_id,
  enabled,
  duration_seconds,
  updated_at
)
SELECT
  c.id,
  TRUE,
  604800,
  now()
FROM public.chats c
WHERE c.type = 'private'
ON CONFLICT (chat_id) DO UPDATE
SET enabled = TRUE,
    duration_seconds = 604800,
    updated_at = now();


-- Ensure every newly created private 1:1 or group chat receives the shared
-- seven-day timer. Public chats remain outside this mechanism.
CREATE OR REPLACE FUNCTION public.ensure_chat_disappearing_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.type = 'private' THEN
    INSERT INTO public.chat_disappearing_settings(chat_id, enabled, duration_seconds)
    VALUES (NEW.id, TRUE, 604800)
    ON CONFLICT (chat_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ensure_chat_disappearing_settings_after_insert ON public.chats;
CREATE TRIGGER ensure_chat_disappearing_settings_after_insert
AFTER INSERT ON public.chats
FOR EACH ROW
EXECUTE FUNCTION public.ensure_chat_disappearing_settings();

REVOKE ALL ON FUNCTION public.ensure_chat_disappearing_settings()
FROM PUBLIC, anon, authenticated, service_role;
