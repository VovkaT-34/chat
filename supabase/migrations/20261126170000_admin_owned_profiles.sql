-- Track which administrator approved each account and enforce ownership server-side.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_approved_by_fkey'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_approved_by_fkey
      FOREIGN KEY (approved_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS profiles_approved_by_idx
  ON public.profiles (approved_by)
  WHERE approved_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS TABLE(id uuid, email text, username text, approved boolean, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  caller_role text;
  caller_approved boolean;
BEGIN
  SELECT p.role, p.approved
    INTO caller_role, caller_approved
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());

  IF caller_approved IS DISTINCT FROM true
     OR caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.username, p.approved, p.role
  FROM public.profiles p
  WHERE caller_role = 'superadmin'
     OR (
       p.role = 'user'
       AND (
         p.approved IS FALSE
         OR (p.approved IS TRUE AND p.approved_by = (SELECT auth.uid()))
       )
     )
  ORDER BY lower(p.username), p.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_profile_action(
  p_action text,
  p_user_id uuid,
  p_role text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  caller_role text;
  caller_approved boolean;
  target_role text;
  target_approved boolean;
  target_approved_by uuid;
BEGIN
  SELECT role, approved
    INTO caller_role, caller_approved
  FROM public.profiles
  WHERE id = (SELECT auth.uid());

  IF caller_approved IS DISTINCT FROM true
     OR caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Нельзя выполнять эту операцию над собственным аккаунтом';
  END IF;

  SELECT role, approved, approved_by
    INTO target_role, target_approved, target_approved_by
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Пользователь не найден';
  END IF;

  IF target_role IN ('admin', 'superadmin')
     AND NOT (
       p_action = 'set_role'
       AND caller_role = 'superadmin'
       AND target_role = 'admin'
     ) THEN
    RAISE EXCEPTION 'Нельзя изменять другого администратора';
  END IF;

  IF p_action = 'approve' THEN
    IF target_approved IS DISTINCT FROM false OR target_role <> 'user' THEN
      RAISE EXCEPTION 'Можно одобрить только ожидающую заявку обычного пользователя';
    END IF;

    UPDATE public.profiles
    SET approved = true,
        approved_by = (SELECT auth.uid())
    WHERE id = p_user_id
      AND approved IS FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Заявка уже обработана';
    END IF;

  ELSIF p_action = 'set_role' THEN
    IF caller_role <> 'superadmin' THEN
      RAISE EXCEPTION 'Только главный администратор может назначать администраторов';
    END IF;

    IF target_approved IS DISTINCT FROM true
       OR p_role NOT IN ('user', 'admin')
       OR target_role = 'superadmin' THEN
      RAISE EXCEPTION 'Недопустимое изменение роли';
    END IF;

    UPDATE public.profiles
    SET role = p_role
    WHERE id = p_user_id;

  ELSIF p_action = 'delete' THEN
    IF caller_role = 'admin'
       AND (
         target_role <> 'user'
         OR (
           target_approved IS TRUE
           AND target_approved_by IS DISTINCT FROM (SELECT auth.uid())
         )
       ) THEN
      RAISE EXCEPTION 'Можно удалить только собственных одобренных пользователей или ожидающие заявки';
    END IF;

    IF target_role <> 'user' THEN
      RAISE EXCEPTION 'Удаление аккаунтов администраторов запрещено';
    END IF;

    UPDATE public.messages
    SET user_id = NULL
    WHERE user_id = p_user_id;

    DELETE FROM auth.users
    WHERE id = p_user_id;

    DELETE FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Профиль пользователя не найден';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- Trigger functions are invoked by their triggers; they need no client EXECUTE grants.
REVOKE EXECUTE ON FUNCTION public.sync_glaz_boga_permission_on_approval()
  FROM PUBLIC, anon, authenticated;
