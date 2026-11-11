-- Restore the backend read required by send-call-push.
-- service_role bypasses RLS, but still needs explicit table privileges.
GRANT SELECT ON TABLE public.chats TO service_role;

-- The active WebRTC client sends these signal types when upgrading
-- an audio call to video. Keep the constraint aligned with the client.
ALTER TABLE public.call_signals
  DROP CONSTRAINT IF EXISTS call_signals_signal_type_check;

ALTER TABLE public.call_signals
  ADD CONSTRAINT call_signals_signal_type_check
  CHECK (signal_type = ANY (ARRAY[
    'offer'::text,
    'answer'::text,
    'ice'::text,
    'reject'::text,
    'hangup'::text,
    'video-offer'::text,
    'video-answer'::text
  ]));
