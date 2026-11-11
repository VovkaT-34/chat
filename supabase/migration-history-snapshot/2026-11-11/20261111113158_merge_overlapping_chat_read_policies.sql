-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

ALTER POLICY authenticated_select_message_deliveries
ON public.message_deliveries
USING (
  (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.id = message_deliveries.message_id
        AND m.user_id = (SELECT auth.uid())
    )
  )
  AND (SELECT public.is_approved_user())
);

DROP POLICY authenticated_select_own_message_deliveries
ON public.message_deliveries;

ALTER POLICY authenticated_select_user_chat_reads
ON public.user_chat_reads
USING (
  (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.chat_id = user_chat_reads.chat_id
        AND m.user_id = (SELECT auth.uid())
    )
  )
  AND (SELECT public.is_approved_user())
);

DROP POLICY authenticated_select_message_sender_chat_reads
ON public.user_chat_reads;
