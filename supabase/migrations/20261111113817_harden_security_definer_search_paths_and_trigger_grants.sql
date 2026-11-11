-- Remove public search_path from functions that already schema-qualify application objects.
-- This prevents object-shadowing through the public schema.
ALTER FUNCTION public.admin_profile_action(text,uuid,text) SET search_path = '';
ALTER FUNCTION public.assign_profile_public_id() SET search_path = '';
ALTER FUNCTION public.check_my_profile() SET search_path = '';
ALTER FUNCTION public.create_group_chat(text,uuid[]) SET search_path = '';
ALTER FUNCTION public.delete_group_chat(bigint) SET search_path = '';
ALTER FUNCTION public.get_chat_members(bigint) SET search_path = '';
ALTER FUNCTION public.get_group_messages_for_superadmin(bigint,bigint,integer) SET search_path = '';
ALTER FUNCTION public.get_message_read_status(bigint) SET search_path = '';
ALTER FUNCTION public.get_message_status(bigint) SET search_path = '';
ALTER FUNCTION public.get_my_chat_list_data(bigint[]) SET search_path = '';
ALTER FUNCTION public.get_my_group_chats() SET search_path = '';
ALTER FUNCTION public.get_my_private_chats() SET search_path = '';
ALTER FUNCTION public.get_my_profile() SET search_path = '';
ALTER FUNCTION public.get_my_unread_counts() SET search_path = '';
ALTER FUNCTION public.get_my_unread_counts(bigint[]) SET search_path = '';
ALTER FUNCTION public.get_private_chat_peer(bigint) SET search_path = '';
ALTER FUNCTION public.get_public_chats() SET search_path = '';
ALTER FUNCTION public.get_unread_messages_count(uuid,bigint) SET search_path = '';
ALTER FUNCTION public.handle_new_user_profile() SET search_path = '';
ALTER FUNCTION public.is_admin() SET search_path = '';
ALTER FUNCTION public.is_chat_member(bigint,uuid) SET search_path = '';
ALTER FUNCTION public.is_chat_member(bigint) SET search_path = '';
ALTER FUNCTION public.is_public_chat(bigint) SET search_path = '';
ALTER FUNCTION public.update_my_profile(text) SET search_path = '';
ALTER FUNCTION public.update_my_public_id(text) SET search_path = '';
ALTER FUNCTION public.update_my_username(text) SET search_path = '';

-- These are invoked by PostgreSQL triggers, never by browser RPC.
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_profile_public_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
