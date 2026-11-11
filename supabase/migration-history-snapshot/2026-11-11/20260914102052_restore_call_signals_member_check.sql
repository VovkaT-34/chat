-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

CREATE OR REPLACE FUNCTION public.is_chat_member(p_chat_id bigint, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_members cm_self
    WHERE cm_self.chat_id = p_chat_id
      AND cm_self.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.chat_members cm_peer
    WHERE cm_peer.chat_id = p_chat_id
      AND cm_peer.user_id = p_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_chat_member(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_member(bigint, uuid) TO authenticated;
