-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

CREATE OR REPLACE FUNCTION public.create_group_chat(
    p_name text,
    p_user_ids uuid[]
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_chat_id bigint;
    v_user_id uuid;
    v_role text;
    v_requested_count integer;
    v_valid_count integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Пользователь не авторизован';
    END IF;

    SELECT role
      INTO v_role
      FROM public.profiles
     WHERE id = auth.uid()
       AND approved = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Пользователь не найден или не одобрен';
    END IF;

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Название группы не указано';
    END IF;

    IF p_user_ids IS NULL THEN
        RAISE EXCEPTION 'Не выбраны пользователи';
    END IF;

    SELECT count(DISTINCT u)::integer
      INTO v_requested_count
      FROM unnest(p_user_ids) AS u
     WHERE u IS NOT NULL
       AND u <> auth.uid();

    IF v_requested_count < 2 THEN
        RAISE EXCEPTION 'Для группового чата нужно минимум 2 других пользователя';
    END IF;

    SELECT count(DISTINCT u)::integer
      INTO v_valid_count
      FROM unnest(p_user_ids) AS u
      JOIN public.profiles p ON p.id = u
     WHERE u <> auth.uid()
       AND p.approved = true;

    IF v_valid_count <> v_requested_count THEN
        RAISE EXCEPTION 'Один или несколько пользователей не найдены или не одобрены';
    END IF;

    INSERT INTO public.chats(name, type, created_by)
    VALUES (trim(p_name), 'private', auth.uid())
    RETURNING id INTO v_chat_id;

    INSERT INTO public.chat_members(chat_id, user_id, role)
    VALUES (v_chat_id, auth.uid(), 'admin');

    FOR v_user_id IN
        SELECT DISTINCT u
          FROM unnest(p_user_ids) AS u
         WHERE u IS NOT NULL
           AND u <> auth.uid()
    LOOP
        INSERT INTO public.chat_members(chat_id, user_id, role)
        VALUES (v_chat_id, v_user_id, 'member')
        ON CONFLICT DO NOTHING;
    END LOOP;

    RETURN v_chat_id;
END;
$function$;
