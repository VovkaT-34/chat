-- Read-only verification for 20261111105048_harden_mutating_chat_rpcs.
-- Expected: all six functions below contain the approval guard.

select
  p.oid::regprocedure::text as function_name,
  position('public.is_approved_user()' in pg_get_functiondef(p.oid)) > 0 as has_approval_guard,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid in (
    'public.add_chat_member(bigint,uuid)'::regprocedure,
    'public.remove_chat_member(bigint,uuid)'::regprocedure,
    'public.rename_group_chat(bigint,text)'::regprocedure,
    'public.leave_chat(bigint)'::regprocedure,
    'public.mark_chat_read(bigint,bigint)'::regprocedure,
    'public.mark_message_delivered(bigint)'::regprocedure
  )
order by 1;
