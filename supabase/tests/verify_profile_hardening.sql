-- Read-only verification queries for migration 20261111120000_harden_profile_access.sql.
-- Run only after the migration has been applied to the intended project.

select
  has_table_privilege('authenticated', 'public.profiles', 'SELECT') as authenticated_table_select,
  has_column_privilege('authenticated', 'public.profiles', 'id', 'SELECT') as can_read_id,
  has_column_privilege('authenticated', 'public.profiles', 'username', 'SELECT') as can_read_username,
  has_column_privilege('authenticated', 'public.profiles', 'public_id', 'SELECT') as can_read_public_id,
  has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT') as can_read_email,
  has_column_privilege('authenticated', 'public.profiles', 'approved', 'SELECT') as can_read_approval,
  has_column_privilege('authenticated', 'public.profiles', 'role', 'SELECT') as can_read_role,
  has_table_privilege('authenticated', 'public.profiles', 'INSERT') as can_insert_profile,
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as can_update_profile;

select
  has_function_privilege('anon', 'public.get_my_access_status()', 'EXECUTE') as anon_can_read_access_status,
  has_function_privilege('authenticated', 'public.get_my_access_status()', 'EXECUTE') as authenticated_can_read_own_access_status,
  has_function_privilege('anon', 'public.admin_list_profiles()', 'EXECUTE') as anon_can_list_profiles,
  has_function_privilege('authenticated', 'public.admin_list_profiles()', 'EXECUTE') as authenticated_can_call_admin_list,
  has_function_privilege('anon', 'public.create_private_chat(uuid)', 'EXECUTE') as anon_can_create_private_chat,
  has_function_privilege('authenticated', 'public.create_private_chat(uuid)', 'EXECUTE') as authenticated_can_create_private_chat;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;

-- All SECURITY DEFINER functions in public must be non-callable by anon.
select p.oid::regprocedure::text as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;

select
  has_function_privilege('anon', 'public.is_approved_user()', 'EXECUTE') as anon_can_check_approval,
  has_function_privilege('authenticated', 'public.is_approved_user()', 'EXECUTE') as authenticated_can_check_own_approval;

select count(*) as approved_user_restrictive_policies
from pg_policies
where schemaname = 'public'
  and policyname = 'approved_users_only'
  and permissive = 'RESTRICTIVE';

-- Expected: zero rows. Any returned function still has anon EXECUTE.
select p.oid::regprocedure::text as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;
