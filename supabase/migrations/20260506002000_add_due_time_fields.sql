alter table public.items
  add column if not exists due_time time;

alter table public.daily_entries
  add column if not exists completed_at timestamptz,
  add column if not exists is_late boolean default false;
