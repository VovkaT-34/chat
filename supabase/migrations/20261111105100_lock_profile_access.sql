-- CHAT-SECURITY-BASE-20261111 — stage 3 (final profile/API lockdown).
-- Apply only after the updated frontend and Edge Functions are deployed on every host.
-- Stage 1 introduced the replacement RPCs; this stage removes direct sensitive-column access.

begin;

-- Remove inherited PUBLIC/anon execution from all SECURITY DEFINER functions
-- in the exposed public schema, while preserving signed-in application RPC access.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute,
           p.prorettype::regtype::text as return_type
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    if f.auth_can_execute and f.return_type not in ('trigger', 'event_trigger') then
      execute format('grant execute on function %s to authenticated', f.signature);
    end if;
  end loop;
end;
$$;

-- No browser role can insert or update profiles directly.
-- Approved status, role and email are available only through restricted RPCs.
revoke all privileges on table public.profiles from anon, authenticated;
grant select (id, username, public_id) on table public.profiles to authenticated;

drop policy if exists authenticated_insert_profiles on public.profiles;
drop policy if exists admin_update_profiles on public.profiles;

-- authenticated_select_profiles continues to require is_approved_user().

commit;
