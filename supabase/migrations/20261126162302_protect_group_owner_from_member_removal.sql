-- Preserve the single-owner invariant: even a global superadmin cannot
-- remove the current group owner without an explicit ownership handoff.

CREATE OR REPLACE FUNCTION public.remove_chat_member(p_chat_id bigint,p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Пользователь не авторизован';
  END IF;
  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Аккаунт не одобрен';
  END IF;

  PERFORM 1 FROM public.chats c WHERE c.id = p_chat_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Группа не найдена';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = p_chat_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.approved IS TRUE AND p.role = 'superadmin'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Только создатель группы или суперадминистратор может удалять пользователей';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Нельзя удалить самого себя';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = p_chat_id
      AND c.is_group IS TRUE
      AND c.created_by = p_user_id
  ) THEN
    RAISE EXCEPTION 'Владельца группы нельзя удалить. Он должен передать управление и выйти самостоятельно';
  END IF;

  DELETE FROM public.chat_members
  WHERE chat_id = p_chat_id AND user_id = p_user_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
