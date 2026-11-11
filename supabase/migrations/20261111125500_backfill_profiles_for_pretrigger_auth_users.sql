-- Backfill accounts created before the auth.users profile trigger existed.
-- All currently orphaned Auth users predate that trigger. Keep them pending:
-- this does not grant chat access or promote any role.
INSERT INTO public.profiles (id, username, email, approved, role)
SELECT
  u.id,
  COALESCE(
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'username'), ''),
    NULLIF(SPLIT_PART(COALESCE(u.email, ''), '@', 1), ''),
    'user'
  ),
  COALESCE(u.email, ''),
  false,
  'user'
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
