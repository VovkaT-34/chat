-- Ensure table-specific permissive policies do not bypass the approved-user gate.
-- PostgreSQL combines permissive policies with OR, so each policy on these
-- approved-user tables must independently enforce approval.

DO $$
DECLARE
  p record;
  v_sql text;
BEGIN
  FOR p IN
    SELECT
      pol.polname,
      pol.polrelid::regclass AS table_name,
      pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
      pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'android_push_tokens',
        'call_signals',
        'chat_members',
        'chat_notification_settings',
        'chats',
        'contact_nicknames',
        'message_deliveries',
        'messages',
        'user_chat_reads',
        'web_push_subscriptions'
      )
      AND pol.polname <> 'approved_users_only'
  LOOP
    v_sql := format('ALTER POLICY %I ON %s', p.polname, p.table_name);
    IF p.using_expr IS NOT NULL THEN
      v_sql := v_sql || format(
        ' USING ((%s) AND (SELECT public.is_approved_user()))',
        p.using_expr
      );
    END IF;
    IF p.check_expr IS NOT NULL THEN
      v_sql := v_sql || format(
        ' WITH CHECK ((%s) AND (SELECT public.is_approved_user()))',
        p.check_expr
      );
    END IF;
    EXECUTE v_sql;
  END LOOP;
END
$$;
