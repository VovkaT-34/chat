CREATE OR REPLACE FUNCTION public.get_chat_message_senders(p_chat_id bigint)
RETURNS TABLE(user_id uuid, username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT DISTINCT m.user_id, p.username
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.user_id
  JOIN public.chats c ON c.id = m.chat_id
  WHERE m.chat_id = p_chat_id
    AND auth.uid() IS NOT NULL
    AND public.is_approved_user()
    AND public.message_visible_to_current_user(m.id, m.expires_at)
    AND (
      c.type = 'public'
      OR EXISTS (
        SELECT 1
        FROM public.chat_members cm
        WHERE cm.chat_id = p_chat_id
          AND cm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles gp
        WHERE gp.id = auth.uid()
          AND gp.approved = true
          AND gp.role IN ('admin', 'superadmin')
      )
    )
  ORDER BY p.username, m.user_id;
$function$;
