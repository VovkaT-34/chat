-- The message renderer reads delivery rows directly.
-- RLS continues to restrict recipients to their own rows and senders to their own messages.
GRANT SELECT ON TABLE public.message_deliveries TO authenticated;
