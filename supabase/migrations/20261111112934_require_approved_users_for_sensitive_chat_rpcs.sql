-- Keep SECURITY DEFINER chat RPCs from returning chat data to unapproved accounts.
-- These functions already bypass table RLS, so enforce the approval gate inside
-- each RPC while preserving signatures, return types, and existing behavior.

DO $$
DECLARE
  r record;
  v_definition text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.get_chat_members(bigint)'::regprocedure, 'and auth.uid() is not null', 'and auth.uid() is not null and public.is_approved_user()'),
      ('public.get_private_chat_peer(bigint)'::regprocedure, 'and cm.user_id <> auth.uid()', 'and cm.user_id <> auth.uid() and public.is_approved_user()'),
      ('public.get_message_read_status(bigint)'::regprocedure, 'SELECT chat_id, user_id', 'IF NOT public.is_approved_user() THEN RAISE EXCEPTION ''Аккаунт не одобрен''; END IF;\n\n    SELECT chat_id, user_id'),
      ('public.get_message_status(bigint)'::regprocedure, 'SELECT m.user_id, m.chat_id, c.type', 'IF NOT public.is_approved_user() THEN RETURN ''none''; END IF;\n\n    SELECT m.user_id, m.chat_id, c.type'),
      ('public.get_my_chat_list_data(bigint[])'::regprocedure, 'RETURN QUERY', 'IF NOT public.is_approved_user() THEN RAISE EXCEPTION ''Аккаунт не одобрен''; END IF;\n\n    RETURN QUERY'),
      ('public.get_my_group_chats()'::regprocedure, 'where c.type=''private''', 'where public.is_approved_user() and c.type=''private'''),
      ('public.get_my_private_chats()'::regprocedure, 'where auth.uid() is not null and cm.user_id=auth.uid()', 'where auth.uid() is not null and public.is_approved_user() and cm.user_id=auth.uid()'),
      ('public.get_my_unread_counts()'::regprocedure, 'where auth.uid() is not null', 'where auth.uid() is not null and public.is_approved_user()'),
      ('public.get_my_unread_counts(bigint[])'::regprocedure, 'RETURN QUERY', 'IF NOT public.is_approved_user() THEN RAISE EXCEPTION ''Аккаунт не одобрен''; END IF;\n\n    RETURN QUERY'),
      ('public.get_public_chats()'::regprocedure, 'WHERE c.type = ''public''', 'WHERE c.type = ''public'' AND public.is_approved_user()'),
      ('public.get_unread_messages_count(uuid,bigint)'::regprocedure, 'IF auth.uid() <> p_user_id THEN', 'IF NOT public.is_approved_user() THEN RAISE EXCEPTION ''Аккаунт не одобрен''; END IF;\n\n    IF auth.uid() <> p_user_id THEN')
    ) AS changes(signature, old_text, new_text)
  LOOP
    v_definition := pg_get_functiondef(r.signature);
    IF position(r.new_text in v_definition) = 0 THEN
      IF position(r.old_text in v_definition) = 0 THEN
        RAISE EXCEPTION 'Expected source fragment not found in %', r.signature;
      END IF;
      v_definition := replace(v_definition, r.old_text, r.new_text);
      EXECUTE v_definition;
    END IF;
  END LOOP;
END
$$;
