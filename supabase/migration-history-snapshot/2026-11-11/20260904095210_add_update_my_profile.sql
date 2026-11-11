-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create or replace function public.update_my_profile(p_username text)
returns table(username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := btrim(coalesce(p_username, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if char_length(v_username) < 1 or char_length(v_username) > 40 then
    raise exception 'username must be between 1 and 40 characters';
  end if;
  update public.profiles
     set username = v_username
   where id = auth.uid();
  if not found then
    raise exception 'profile not found';
  end if;
  return query select p.username from public.profiles p where p.id = auth.uid();
end;
$$;
revoke all on function public.update_my_profile(text) from public;
grant execute on function public.update_my_profile(text) to authenticated;
