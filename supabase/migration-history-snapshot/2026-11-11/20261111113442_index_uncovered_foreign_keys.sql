-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

CREATE INDEX IF NOT EXISTS call_signals_chat_id_idx
  ON public.call_signals (chat_id);
CREATE INDEX IF NOT EXISTS call_signals_sender_id_idx
  ON public.call_signals (sender_id);
CREATE INDEX IF NOT EXISTS chat_notification_settings_chat_id_idx
  ON public.chat_notification_settings (chat_id);
CREATE INDEX IF NOT EXISTS contact_nicknames_target_user_id_idx
  ON public.contact_nicknames (target_user_id);
CREATE INDEX IF NOT EXISTS messages_reply_to_idx
  ON public.messages (reply_to);
CREATE INDEX IF NOT EXISTS messages_user_id_idx
  ON public.messages (user_id);
CREATE INDEX IF NOT EXISTS user_app_permissions_app_id_idx
  ON public.user_app_permissions (app_id);
CREATE INDEX IF NOT EXISTS user_app_permissions_updated_by_idx
  ON public.user_app_permissions (updated_by);
CREATE INDEX IF NOT EXISTS user_chat_reads_chat_id_idx
  ON public.user_chat_reads (chat_id);
CREATE INDEX IF NOT EXISTS user_chat_reads_last_read_message_id_idx
  ON public.user_chat_reads (last_read_message_id);
