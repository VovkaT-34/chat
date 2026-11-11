-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.web_push_subscriptions enable row level security;

create policy "Users can view own push subscriptions"
on public.web_push_subscriptions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own push subscriptions"
on public.web_push_subscriptions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own push subscriptions"
on public.web_push_subscriptions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own push subscriptions"
on public.web_push_subscriptions for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists web_push_subscriptions_user_id_idx on public.web_push_subscriptions(user_id);
