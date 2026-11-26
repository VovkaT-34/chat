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
