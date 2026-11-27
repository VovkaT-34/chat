alter table public.web_push_subscriptions add column if not exists active_until timestamptz;
