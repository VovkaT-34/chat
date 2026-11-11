-- Reveal another user's read cursor only after it has passed at least
-- one message authored by the current user. This preserves the existing
-- ✓✓ status calculation while avoiding exposure of unrelated read progress.
DROP POLICY IF EXISTS authenticated_select_user_chat_reads ON public.user_chat_reads;

CREATE POLICY authenticated_select_user_chat_reads
ON public.user_chat_reads
FOR SELECT
TO authenticated
USING (
  (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.chat_id = user_chat_reads.chat_id
        AND m.user_id = (SELECT auth.uid())
        AND m.id <= user_chat_reads.last_read_message_id
    )
  )
  AND (SELECT public.is_approved_user())
);
