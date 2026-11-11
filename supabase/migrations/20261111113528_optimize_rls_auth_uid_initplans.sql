-- Wrap auth.uid() in scalar subqueries so Postgres evaluates it once per statement,
-- not once per candidate row. Access predicates remain unchanged.

ALTER POLICY "authenticated_select_chat_members" ON public."chat_members" USING (((user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "chat_notification_settings_delete_own" ON public."chat_notification_settings" USING (((user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "chat_notification_settings_insert_own" ON public."chat_notification_settings" WITH CHECK (((user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "chat_notification_settings_select_own" ON public."chat_notification_settings" USING (((user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "chat_notification_settings_update_own" ON public."chat_notification_settings" USING (((user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user))) WITH CHECK (((user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_select_chats" ON public."chats" USING ((((type = 'public'::text) OR (EXISTS ( SELECT 1
   FROM chat_members cm
  WHERE ((cm.chat_id = chats.id) AND (cm.user_id = ( SELECT auth.uid() )))))) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_delete_own_contact_nicknames" ON public."contact_nicknames" USING (((owner_user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_insert_own_contact_nicknames" ON public."contact_nicknames" WITH CHECK (((owner_user_id = ( SELECT auth.uid() )) AND (owner_user_id <> target_user_id) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_select_own_contact_nicknames" ON public."contact_nicknames" USING (((owner_user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_update_own_contact_nicknames" ON public."contact_nicknames" USING (((owner_user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user))) WITH CHECK (((owner_user_id = ( SELECT auth.uid() )) AND (owner_user_id <> target_user_id) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_insert_message_deliveries" ON public."message_deliveries" WITH CHECK (((user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_insert_messages" ON public."messages" WITH CHECK (((user_id = ( SELECT auth.uid() )) AND (EXISTS ( SELECT 1
   FROM chats c
  WHERE ((c.id = messages.chat_id) AND ((c.type = 'public'::text) OR (EXISTS ( SELECT 1
           FROM chat_members cm
          WHERE ((cm.chat_id = c.id) AND (cm.user_id = ( SELECT auth.uid() ))))))))) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_select_messages" ON public."messages" USING (((EXISTS ( SELECT 1
   FROM chats c
  WHERE ((c.id = messages.chat_id) AND ((c.type = 'public'::text) OR (EXISTS ( SELECT 1
           FROM chat_members cm
          WHERE ((cm.chat_id = c.id) AND (cm.user_id = ( SELECT auth.uid() ))))))))) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_insert_user_chat_reads" ON public."user_chat_reads" WITH CHECK (((user_id = ( SELECT auth.uid() )) AND (EXISTS ( SELECT 1
   FROM chats c
  WHERE ((c.id = user_chat_reads.chat_id) AND ((c.type = 'public'::text) OR (EXISTS ( SELECT 1
           FROM chat_members cm
          WHERE ((cm.chat_id = c.id) AND (cm.user_id = ( SELECT auth.uid() ))))))))) AND ( SELECT is_approved_user() AS is_approved_user)));
ALTER POLICY "authenticated_update_user_chat_reads" ON public."user_chat_reads" USING (((user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user))) WITH CHECK (((user_id = ( SELECT auth.uid() )) AND ( SELECT is_approved_user() AS is_approved_user)));
