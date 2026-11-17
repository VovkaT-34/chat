-- Grant Glaz Boga to every approved account.
-- The existing app-permission checks remain in place; this keeps one access-control
-- chain while making account approval grant this application by default.

insert into public.user_app_permissions (user_id, app_id, allowed, updated_at, updated_by)
select p.id, 'glaz-boga', true, now(), null
from public.profiles p
where p.approved is true
on conflict (user_id, app_id) do update
set allowed = true,
    updated_at = now(),
    updated_by = null
where public.user_app_permissions.allowed is distinct from true;

create or replace function public.sync_glaz_boga_permission_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.approved is true and
       (tg_op = 'INSERT' or old.approved is distinct from true) then
        insert into public.user_app_permissions (user_id, app_id, allowed, updated_at, updated_by)
        values (new.id, 'glaz-boga', true, now(), null)
        on conflict (user_id, app_id) do update
        set allowed = true,
            updated_at = now(),
            updated_by = null;
    elsif new.approved is not true and
          tg_op = 'UPDATE' and old.approved is distinct from false then
        update public.user_app_permissions
        set allowed = false,
            updated_at = now(),
            updated_by = null
        where user_id = new.id
          and app_id = 'glaz-boga';
    end if;

    return new;
end;
$$;

drop trigger if exists sync_glaz_boga_permission_on_approval on public.profiles;

create trigger sync_glaz_boga_permission_on_approval
after insert or update of approved on public.profiles
for each row
execute function public.sync_glaz_boga_permission_on_approval();
