-- Disappearing messages are enabled by default for private 1:1 and group chats.
-- Public chats are deliberately excluded and retain their existing 150-message cleanup.

ALTER TABLE public.chat_disappearing_settings
  ALTER COLUMN enabled SET DEFAULT TRUE;

INSERT INTO public.chat_disappearing_settings(chat_id, enabled, duration_seconds)
SELECT c.id, TRUE, 604800
FROM public.chats c
WHERE c.type = 'private'
ON CONFLICT (chat_id) DO UPDATE
SET enabled = TRUE,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.ensure_chat_disappearing_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.type = 'private' THEN
    INSERT INTO public.chat_disappearing_settings(chat_id, enabled, duration_seconds)
    VALUES (NEW.id, TRUE, 604800)
    ON CONFLICT (chat_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ensure_chat_disappearing_settings_after_insert ON public.chats;
CREATE TRIGGER ensure_chat_disappearing_settings_after_insert
AFTER INSERT ON public.chats
FOR EACH ROW
EXECUTE FUNCTION public.ensure_chat_disappearing_settings();

REVOKE ALL ON FUNCTION public.ensure_chat_disappearing_settings() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_chat_disappearing_settings(p_chat_id bigint)
RETURNS TABLE(
  shared_enabled boolean,
  shared_duration_seconds integer,
  personal_enabled boolean,
  personal_duration_seconds integer,
  can_manage_shared boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_type text;
  v_is_group boolean;
  v_owner uuid;
  v_member_count integer;
  v_shared_enabled boolean := TRUE;
  v_shared_duration integer := 604800;
  v_personal_enabled boolean := FALSE;
  v_personal_duration integer := 604800;
  v_can_manage_shared boolean := FALSE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Пользователь не авторизован или аккаунт не одобрен';
  END IF;

  SELECT c.type, c.is_group, c.created_by,
         (SELECT count(*)::integer FROM public.chat_members cm WHERE cm.chat_id = c.id)
  INTO v_type, v_is_group, v_owner, v_member_count
  FROM public.chats c
  WHERE c.id = p_chat_id;

  IF NOT FOUND OR v_type <> 'private' THEN
    RAISE EXCEPTION 'Настройка доступна только в личных и групповых чатах';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_members cm
    WHERE cm.chat_id = p_chat_id AND cm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Нет доступа к этому чату';
  END IF;

  IF NOT v_is_group AND v_member_count <> 2 THEN
    RAISE EXCEPTION 'Настройка доступна только в личном чате один на один';
  END IF;

  v_can_manage_shared := (NOT v_is_group AND v_member_count = 2)
    OR (v_is_group AND v_owner = v_uid);

  SELECT s.enabled, s.duration_seconds
  INTO v_shared_enabled, v_shared_duration
  FROM public.chat_disappearing_settings s
  WHERE s.chat_id = p_chat_id;

  SELECT s.enabled, s.duration_seconds
  INTO v_personal_enabled, v_personal_duration
  FROM public.user_chat_disappearing_settings s
  WHERE s.chat_id = p_chat_id AND s.user_id = v_uid;

  RETURN QUERY
  SELECT COALESCE(v_shared_enabled, TRUE),
         COALESCE(v_shared_duration, 604800),
         COALESCE(v_personal_enabled, FALSE),
         COALESCE(v_personal_duration, 604800),
         v_can_manage_shared;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_chat_disappearing_settings(
  p_chat_id bigint,
  p_mode text,
  p_enabled boolean,
  p_duration_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_type text;
  v_is_group boolean;
  v_owner uuid;
  v_member_count integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Пользователь не авторизован или аккаунт не одобрен';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('self', 'all')
     OR p_enabled IS DISTINCT FROM TRUE
     OR p_duration_seconds IS NULL
     OR p_duration_seconds NOT IN (30, 300, 3600, 10800, 86400, 259200, 604800) THEN
    RAISE EXCEPTION 'Некорректные параметры исчезающих сообщений';
  END IF;

  SELECT c.type, c.is_group, c.created_by,
         (SELECT count(*)::integer FROM public.chat_members cm WHERE cm.chat_id = c.id)
  INTO v_type, v_is_group, v_owner, v_member_count
  FROM public.chats c
  WHERE c.id = p_chat_id;

  IF NOT FOUND OR v_type <> 'private' THEN
    RAISE EXCEPTION 'Настройка доступна только в личных и групповых чатах';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_members cm
    WHERE cm.chat_id = p_chat_id AND cm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Нет доступа к этому чату';
  END IF;

  IF NOT v_is_group AND v_member_count <> 2 THEN
    RAISE EXCEPTION 'Настройка доступна только в личном чате один на один';
  END IF;

  IF p_mode = 'all' THEN
    IF v_is_group AND v_owner IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Только владелец группы может управлять исчезновением для всех';
    END IF;

    INSERT INTO public.chat_disappearing_settings(
      chat_id, enabled, duration_seconds, updated_by, updated_at
    )
    VALUES (p_chat_id, TRUE, p_duration_seconds, v_uid, now())
    ON CONFLICT (chat_id) DO UPDATE
    SET enabled = TRUE,
        duration_seconds = EXCLUDED.duration_seconds,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
  ELSE
    INSERT INTO public.user_chat_disappearing_settings(
      chat_id, user_id, enabled, duration_seconds, updated_at
    )
    VALUES (p_chat_id, v_uid, TRUE, p_duration_seconds, now())
    ON CONFLICT (chat_id, user_id) DO UPDATE
    SET enabled = TRUE,
        duration_seconds = EXCLUDED.duration_seconds,
        updated_at = now();
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_chat_disappearing_settings(bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_chat_disappearing_settings(bigint, text, boolean, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_chat_disappearing_settings(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_disappearing_settings(bigint, text, boolean, integer) TO authenticated;
