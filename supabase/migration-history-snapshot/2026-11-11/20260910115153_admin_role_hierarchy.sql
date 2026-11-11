-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

-- Role hierarchy: superadmin > admin > user.
-- Keep existing admin checks working for both admin levels.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin','superadmin')
      and approved = true
  );
$$;

-- The current top-level administrator becomes the protected superadmin.
update public.profiles
set role = 'superadmin'
where id = '4a99a734-502d-4310-b782-ab1cacb9a664'
  and approved = true
  and role = 'admin';
