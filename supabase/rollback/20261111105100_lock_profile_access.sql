-- Emergency rollback for 20261111105100_lock_profile_access.
-- Run this BEFORE rolling back 20261111123000 and 20261111120000.
-- Restores the stage-1 compatibility state, not the original pre-audit state.

begin;

-- Restore the stage-1 profile table privileges: SELECT/INSERT remain available,
-- UPDATE remains revoked, and RLS still limits INSERT to role=user, approved=false.
grant select, insert, delete, truncate, references, trigger, maintain
on table public.profiles to authenticated;
grant truncate, references, trigger, maintain
on table public.profiles to anon;

create policy authenticated_insert_profiles
on public.profiles
for insert
to authenticated
with check (
  id = (select auth.uid())
  and role = 'user'
  and approved is false
);

-- Restore PUBLIC execution only for the SECURITY DEFINER functions that had it
-- before stage 3. Stage-1 RPCs remain explicitly authenticated-only.
grant execute on function public.check_my_profile() to public;
grant execute on function public.create_private_chat(uuid) to public;
grant execute on function public.delete_group_chat(bigint) to public;
grant execute on function public.get_chat_members(bigint) to public;
grant execute on function public.get_group_messages_for_superadmin(bigint,bigint,integer) to public;
grant execute on function public.get_message_read_status(bigint) to public;
grant execute on function public.get_message_status(bigint) to public;
grant execute on function public.get_my_chat_list_data(bigint[]) to public;
grant execute on function public.get_my_group_chats() to public;
grant execute on function public.get_my_private_chats() to public;
grant execute on function public.get_my_profile() to public;
grant execute on function public.get_my_unread_counts(bigint[]) to public;
grant execute on function public.get_my_unread_counts() to public;
grant execute on function public.get_public_chats() to public;
grant execute on function public.get_unread_messages_count(uuid,bigint) to public;
grant execute on function public.handle_new_user_profile() to public;
grant execute on function public.is_admin() to public;
grant execute on function public.is_chat_member(bigint) to public;
grant execute on function public.is_public_chat(bigint) to public;
grant execute on function public.leave_chat(bigint) to public;
grant execute on function public.mark_message_delivered(bigint) to public;
grant execute on function public.rls_auto_enable() to public;
grant execute on function public.search_users(text) to public;

-- Remove only the authenticated grants that were added to functions whose
-- baseline ACL was NULL (they inherit EXECUTE from PUBLIC after the grant above).
revoke execute on function public.check_my_profile() from authenticated;
revoke execute on function public.create_private_chat(uuid) from authenticated;
revoke execute on function public.get_message_read_status(bigint) from authenticated;
revoke execute on function public.get_message_status(bigint) from authenticated;
revoke execute on function public.get_my_chat_list_data(bigint[]) from authenticated;
revoke execute on function public.get_my_private_chats() from authenticated;
revoke execute on function public.get_my_profile() from authenticated;
revoke execute on function public.get_my_unread_counts(bigint[]) from authenticated;
revoke execute on function public.get_my_unread_counts() from authenticated;
revoke execute on function public.get_public_chats() from authenticated;
revoke execute on function public.get_unread_messages_count(uuid,bigint) from authenticated;
revoke execute on function public.is_admin() from authenticated;
revoke execute on function public.is_chat_member(bigint) from authenticated;
revoke execute on function public.is_public_chat(bigint) from authenticated;
revoke execute on function public.mark_message_delivered(bigint) from authenticated;

commit;
