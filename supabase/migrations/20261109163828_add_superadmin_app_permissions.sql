create table if not exists public.app_catalog (app_id text primary key, name text not null, active boolean not null default true, sort_order integer not null default 100);
create table if not exists public.user_app_permissions (user_id uuid not null references public.profiles(id) on delete cascade, app_id text not null references public.app_catalog(app_id) on delete cascade, allowed boolean not null default false, updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null, primary key (user_id, app_id));
alter table public.app_catalog enable row level security;
alter table public.user_app_permissions enable row level security;
revoke all on public.app_catalog from anon, authenticated;
revoke all on public.user_app_permissions from anon, authenticated;
insert into public.app_catalog (app_id, name, sort_order) values ('glaz-boga', 'Глаз Бога', 10), ('airplanes5', 'Airplanes 2 — Самолётики 5', 20) on conflict (app_id) do update set name=excluded.name, active=true, sort_order=excluded.sort_order;
create or replace function public.has_app_access(p_app_id text) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists (select 1 from public.profiles p join public.user_app_permissions u on u.user_id=p.id join public.app_catalog a on a.app_id=u.app_id where p.id=auth.uid() and p.approved is true and a.app_id=p_app_id and a.active is true and u.allowed is true);
$$;
create or replace function public.get_app_permissions_for_admin() returns table (user_id uuid,email text,username text,role text,app_id text,app_name text,allowed boolean) language plpgsql stable security definer set search_path='' as $$
begin
if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved is true and p.role='superadmin') then raise exception 'Только одобренный супер-администратор может просматривать разрешения'; end if;
return query select p.id,p.email,p.username,p.role,a.app_id,a.name,coalesce(u.allowed,false) from public.profiles p cross join public.app_catalog a left join public.user_app_permissions u on u.user_id=p.id and u.app_id=a.app_id where p.approved is true and a.active is true order by p.username,a.sort_order,a.app_id;
end;
$$;
create or replace function public.set_app_permission(p_user_id uuid,p_app_id text,p_allowed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved is true and p.role='superadmin') then raise exception 'Только одобренный супер-администратор может менять разрешения'; end if;
if p_user_id is null or p_app_id is null or p_allowed is null then raise exception 'Некорректные параметры'; end if;
if not exists(select 1 from public.profiles p where p.id=p_user_id and p.approved is true) then raise exception 'Целевой пользователь не найден или не одобрен'; end if;
if not exists(select 1 from public.app_catalog a where a.app_id=p_app_id and a.active is true) then raise exception 'Приложение не найдено или отключено'; end if;
insert into public.user_app_permissions(user_id,app_id,allowed,updated_at,updated_by) values(p_user_id,p_app_id,p_allowed,now(),auth.uid()) on conflict(user_id,app_id) do update set allowed=excluded.allowed,updated_at=now(),updated_by=auth.uid();
return jsonb_build_object('ok',true,'user_id',p_user_id,'app_id',p_app_id,'allowed',p_allowed);
end;
$$;
revoke all on function public.has_app_access(text) from public,anon;
revoke all on function public.get_app_permissions_for_admin() from public,anon;
revoke all on function public.set_app_permission(uuid,text,boolean) from public,anon;
grant execute on function public.has_app_access(text) to authenticated;
grant execute on function public.get_app_permissions_for_admin() to authenticated;
grant execute on function public.set_app_permission(uuid,text,boolean) to authenticated;
