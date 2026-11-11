-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.get_my_app_permissions()
returns table (app_id text, allowed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.app_id, coalesce(u.allowed, false)
  from public.app_catalog a
  left join public.user_app_permissions u
    on u.app_id = a.app_id and u.user_id = auth.uid()
  where a.active is true
    and auth.uid() is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.approved is true
    )
  order by a.sort_order, a.app_id;
$$;
revoke all on function public.get_my_app_permissions() from public, anon;
grant execute on function public.get_my_app_permissions() to authenticated;
