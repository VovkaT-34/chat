-- Direct access to settings tables is denied; RPCs are the only settings interface.
DROP INDEX IF EXISTS public.message_user_expirations_expires_at_idx;

CREATE INDEX IF NOT EXISTS chat_disappearing_settings_updated_by_idx
  ON public.chat_disappearing_settings (updated_by);
CREATE INDEX IF NOT EXISTS user_chat_disappearing_settings_user_id_idx
  ON public.user_chat_disappearing_settings (user_id);

DROP POLICY IF EXISTS chat_disappearing_settings_deny_direct_access
  ON public.chat_disappearing_settings;
CREATE POLICY chat_disappearing_settings_deny_direct_access
  ON public.chat_disappearing_settings
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS user_chat_disappearing_settings_deny_direct_access
  ON public.user_chat_disappearing_settings;
CREATE POLICY user_chat_disappearing_settings_deny_direct_access
  ON public.user_chat_disappearing_settings
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
