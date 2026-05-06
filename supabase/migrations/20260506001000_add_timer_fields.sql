alter table public.items
  add column if not exists timer_minutes numeric;

alter table public.daily_entries
  add column if not exists timer_seconds_done numeric default 0,
  add column if not exists timer_completed boolean default false;
