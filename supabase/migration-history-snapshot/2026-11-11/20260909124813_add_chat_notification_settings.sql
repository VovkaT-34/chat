-- Recovered from Supabase schema_migrations on 2026-11-11.
-- ARCHIVE ONLY: do not run or move into supabase/migrations without review.

create table if not exists public.chat_notification_settings (
    user_id uuid not null references auth.users(id) on delete cascade,
    chat_id bigint not null references public.chats(id) on delete cascade,
    sound_enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, chat_id)
);

alter table public.chat_notification_settings enable row level security;

create policy "chat_notification_settings_select_own"
on public.chat_notification_settings
for select
to authenticated
using (user_id = auth.uid());

create policy "chat_notification_settings_insert_own"
on public.chat_notification_settings
for insert
to authenticated
with check (user_id = auth.uid());

create policy "chat_notification_settings_update_own"
on public.chat_notification_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "chat_notification_settings_delete_own"
on public.chat_notification_settings
for delete
to authenticated
using (user_id = auth.uid());
