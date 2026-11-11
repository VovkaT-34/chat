REVOKE TRUNCATE ON TABLE
  public.android_push_tokens,
  public.call_signals,
  public.chat_members,
  public.chat_notification_settings,
  public.chats,
  public.contact_nicknames,
  public.message_deliveries,
  public.messages,
  public.profiles,
  public.user_chat_reads,
  public.web_push_subscriptions
FROM anon, authenticated;
