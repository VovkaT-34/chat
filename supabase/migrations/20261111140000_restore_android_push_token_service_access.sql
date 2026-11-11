-- send-message-push reads Android FCM tokens and removes invalid tokens.
-- Keep these backend-only permissions scoped to the service role.
GRANT SELECT, DELETE ON TABLE public.android_push_tokens TO service_role;
