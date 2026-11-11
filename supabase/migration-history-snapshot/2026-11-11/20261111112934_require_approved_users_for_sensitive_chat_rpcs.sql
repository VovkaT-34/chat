-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

CREATE OR REPLACE FUNCTION public.get_chat_members(p_chat_id bigint)
RETURNS TABLE(user_id uuid, username text, public_id text, nickname text, role text, is_admin boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    cm.user_id,
    p.username,
    p.public_id,
    cn.nickname,
    cm.role,
    exists(
      select 1 from public.chat_members me
      where me.chat_id = p_chat_id and me.user_id = auth.uid() and me.role = 'admin'
    )
    or exists(
      select 1 from public.profiles gp
      where gp.id = auth.uid() and gp.approved = true and gp.role in ('admin','superadmin')
    ) as is_admin
  from public.chat_members cm
  join public.profiles p on p.id = cm.user_id
  left join public.contact_nicknames cn
    on cn.owner_user_id = auth.uid() and cn.target_user_id = cm.user_id
  where cm.chat_id = p_chat_id
    and auth.uid() is not null
    and public.is_approved_user()
    and (
      exists(
        select 1 from public.chat_members viewer
        where viewer.chat_id = p_chat_id and viewer.user_id = auth.uid()
      )
      or exists(
        select 1 from public.profiles gp
        where gp.id = auth.uid() and gp.approved = true and gp.role in ('admin','superadmin')
      )
    )
  order by cm.role = 'admin' desc, lower(p.username), cm.user_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_private_chat_peer(p_chat_id bigint)
RETURNS TABLE(user_id uuid, username text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select p.id, p.username
  from public.chat_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.chat_id = p_chat_id
    and cm.user_id <> auth.uid()
    and public.is_approved_user()
    and exists (
      select 1 from public.chat_members own
      where own.chat_id = p_chat_id
        and own.user_id = auth.uid()
    )
    and (select count(*) from public.chat_members all_members where all_members.chat_id = p_chat_id) = 2
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_message_read_status(p_message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_chat_id bigint;
    v_message_user_id uuid;
    v_is_read boolean := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Пользователь не авторизован';
    END IF;
    IF NOT public.is_approved_user() THEN
        RAISE EXCEPTION 'Аккаунт не одобрен';
    END IF;

    SELECT chat_id, user_id
    INTO v_chat_id, v_message_user_id
    FROM public.messages
    WHERE id = p_message_id;

    IF v_chat_id IS NULL THEN
        RAISE EXCEPTION 'Сообщение не найдено';
    END IF;

    IF v_message_user_id <> v_user_id THEN
        RAISE EXCEPTION 'Нет доступа к статусу сообщения';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.chat_members cm
        WHERE cm.chat_id = v_chat_id AND cm.user_id <> v_user_id
    ) THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.chat_members cm
            JOIN public.user_chat_reads r
              ON r.chat_id = cm.chat_id AND r.user_id = cm.user_id
            WHERE cm.chat_id = v_chat_id
              AND cm.user_id <> v_user_id
              AND r.last_read_message_id >= p_message_id
        ) INTO v_is_read;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.user_chat_reads r
            WHERE r.chat_id = v_chat_id
              AND r.user_id <> v_user_id
              AND r.last_read_message_id >= p_message_id
        ) INTO v_is_read;
    END IF;
    RETURN v_is_read;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_message_status(p_message_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_sender_id uuid;
    v_chat_id bigint;
    v_chat_type text;
    v_recipient_count integer;
    v_delivered_count integer;
    v_read_count integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR NOT public.is_approved_user() THEN
        RETURN 'none';
    END IF;

    SELECT m.user_id, m.chat_id, c.type
    INTO v_sender_id, v_chat_id, v_chat_type
    FROM public.messages m
    JOIN public.chats c ON c.id = m.chat_id
    WHERE m.id = p_message_id;

    IF v_chat_id IS NULL OR v_sender_id <> v_user_id THEN
        RETURN 'none';
    END IF;

    IF v_chat_type = 'public' THEN
        SELECT COUNT(*) INTO v_delivered_count
        FROM public.message_deliveries md
        WHERE md.message_id = p_message_id AND md.user_id <> v_sender_id;

        SELECT COUNT(*) INTO v_read_count
        FROM public.user_chat_reads ucr
        WHERE ucr.chat_id = v_chat_id
          AND ucr.user_id <> v_sender_id
          AND ucr.last_read_message_id >= p_message_id;

        IF v_read_count > 0 THEN RETURN 'read'; END IF;
        IF v_delivered_count > 0 THEN RETURN 'delivered'; END IF;
        RETURN 'sent';
    END IF;

    SELECT COUNT(*) INTO v_recipient_count
    FROM public.chat_members
    WHERE chat_id = v_chat_id AND user_id <> v_sender_id;

    SELECT COUNT(*) INTO v_delivered_count
    FROM public.message_deliveries md
    JOIN public.chat_members cm
      ON cm.chat_id = v_chat_id AND cm.user_id = md.user_id
    WHERE md.message_id = p_message_id AND md.user_id <> v_sender_id;

    SELECT COUNT(*) INTO v_read_count
    FROM public.chat_members cm
    JOIN public.user_chat_reads ucr
      ON ucr.chat_id = cm.chat_id AND ucr.user_id = cm.user_id
    WHERE cm.chat_id = v_chat_id
      AND cm.user_id <> v_sender_id
      AND ucr.last_read_message_id >= p_message_id;

    IF v_recipient_count = 0 THEN RETURN 'sent'; END IF;
    IF v_read_count > 0 THEN RETURN 'read'; END IF;
    IF v_delivered_count > 0 THEN RETURN 'delivered'; END IF;
    RETURN 'sent';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_chat_list_data(p_chat_ids bigint[])
RETURNS TABLE(chat_id bigint, unread_count bigint, last_message_id bigint, last_message_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Пользователь не авторизован';
    END IF;
    IF NOT public.is_approved_user() THEN
        RAISE EXCEPTION 'Аккаунт не одобрен';
    END IF;

    RETURN QUERY
    WITH requested AS (
        SELECT DISTINCT x AS chat_id
        FROM unnest(COALESCE(p_chat_ids, ARRAY[]::bigint[])) x
        JOIN public.chats c ON c.id = x
        WHERE x > 0
          AND (c.type = 'public' OR EXISTS (
              SELECT 1 FROM public.chat_members cm
              WHERE cm.chat_id = c.id AND cm.user_id = v_user_id
          ))
    ),
    unread AS (
        SELECT r.chat_id, COUNT(m.id)::bigint AS unread_count
        FROM requested r
        LEFT JOIN public.user_chat_reads ucr
          ON ucr.chat_id = r.chat_id AND ucr.user_id = v_user_id
        LEFT JOIN public.messages m
          ON m.chat_id = r.chat_id
         AND m.id > COALESCE(ucr.last_read_message_id, 0)
         AND m.user_id <> v_user_id
        GROUP BY r.chat_id
    ),
    latest AS (
        SELECT DISTINCT ON (m.chat_id) m.chat_id, m.id AS last_message_id
        FROM public.messages m
        JOIN requested r ON r.chat_id = m.chat_id
        WHERE m.user_id = v_user_id
        ORDER BY m.chat_id, m.created_at DESC, m.id DESC
    ),
    statuses AS (
        SELECT l.chat_id, l.last_message_id,
               public.get_message_status(l.last_message_id) AS last_message_status
        FROM latest l
    )
    SELECT r.chat_id,
           COALESCE(u.unread_count, 0)::bigint,
           s.last_message_id,
           s.last_message_status
    FROM requested r
    LEFT JOIN unread u ON u.chat_id = r.chat_id
    LEFT JOIN statuses s ON s.chat_id = r.chat_id
    ORDER BY r.chat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_group_chats()
RETURNS TABLE(chat_id bigint, chat_name text, last_message_at timestamp with time zone, is_member boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
 select c.id, c.name,
        (select max(m.created_at) from public.messages m where m.chat_id=c.id),
        exists(select 1 from public.chat_members cm where cm.chat_id=c.id and cm.user_id=auth.uid())
 from public.chats c
 where auth.uid() is not null
   and public.is_approved_user()
   and c.type='private'
   and (select count(*) from public.chat_members cm2 where cm2.chat_id=c.id) >= 3
   and (
     exists(select 1 from public.chat_members cm where cm.chat_id=c.id and cm.user_id=auth.uid())
     or exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='superadmin')
   )
 order by 3 desc nulls last, c.id desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_private_chats()
RETURNS TABLE(chat_id bigint, chat_name text, last_message_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
 select c.id,
 coalesce((select p.username from public.chat_members cm2 join public.profiles p on p.id=cm2.user_id where cm2.chat_id=c.id and cm2.user_id<>auth.uid() limit 1),'Личный чат'),
 (select max(m.created_at) from public.messages m where m.chat_id=c.id)
 from public.chats c join public.chat_members cm on cm.chat_id=c.id
 where auth.uid() is not null
 and public.is_approved_user()
 and cm.user_id=auth.uid() and c.type='private'
 and (select count(*) from public.chat_members cm3 where cm3.chat_id=c.id)=2
 order by 3 desc nulls last,c.id desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_unread_counts()
RETURNS TABLE(chat_id bigint, unread_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select c.id as chat_id,
         count(m.id) as unread_count
  from public.chats c
  join public.messages m on m.chat_id = c.id
  left join public.user_chat_reads r
    on r.user_id = auth.uid()
   and r.chat_id = c.id
  where auth.uid() is not null
    and public.is_approved_user()
    and m.id > coalesce(r.last_read_message_id, 0)
    and m.user_id <> auth.uid()
    and (
      c.type = 'public'
      or exists (
        select 1 from public.chat_members cm
        where cm.chat_id = c.id and cm.user_id = auth.uid()
      )
    )
  group by c.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_unread_counts(p_chat_ids bigint[])
RETURNS TABLE(chat_id bigint, unread_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Пользователь не авторизован';
    END IF;
    IF NOT public.is_approved_user() THEN
        RAISE EXCEPTION 'Аккаунт не одобрен';
    END IF;

    RETURN QUERY
    WITH requested AS (
        SELECT DISTINCT x AS chat_id
        FROM unnest(COALESCE(p_chat_ids, ARRAY[]::bigint[])) x
        JOIN public.chats c ON c.id = x
        WHERE x > 0
          AND (c.type = 'public' OR EXISTS (
              SELECT 1 FROM public.chat_members cm
              WHERE cm.chat_id = c.id AND cm.user_id = v_user_id
          ))
    )
    SELECT r.chat_id, COUNT(m.id)::bigint AS unread_count
    FROM requested r
    LEFT JOIN public.user_chat_reads ucr
      ON ucr.chat_id = r.chat_id AND ucr.user_id = v_user_id
    LEFT JOIN public.messages m
      ON m.chat_id = r.chat_id
     AND m.id > COALESCE(ucr.last_read_message_id, 0)
     AND m.user_id <> v_user_id
    GROUP BY r.chat_id
    ORDER BY r.chat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_chats()
RETURNS TABLE(id bigint, name text, type text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT c.id, c.name, c.type
    FROM public.chats AS c
    WHERE c.type = 'public'
      AND public.is_approved_user()
    ORDER BY c.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_unread_messages_count(p_user_id uuid, p_chat_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_count bigint;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Пользователь не авторизован';
    END IF;
    IF NOT public.is_approved_user() THEN
        RAISE EXCEPTION 'Аккаунт не одобрен';
    END IF;
    IF auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Недопустимый пользователь';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.chats c
        WHERE c.id = p_chat_id
          AND (c.type = 'public' OR EXISTS (
              SELECT 1 FROM public.chat_members cm
              WHERE cm.chat_id = c.id AND cm.user_id = auth.uid()
          ))
    ) THEN
        RAISE EXCEPTION 'Нет доступа к этому чату';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.messages m
    LEFT JOIN public.user_chat_reads r
      ON r.user_id = p_user_id AND r.chat_id = p_chat_id
    WHERE m.chat_id = p_chat_id
      AND m.id > COALESCE(r.last_read_message_id, 0)
      AND m.user_id <> p_user_id;
    RETURN v_count;
END;
$function$;
