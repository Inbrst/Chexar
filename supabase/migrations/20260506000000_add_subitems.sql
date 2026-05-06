alter table public.items
  add column if not exists subitems jsonb;

alter table public.daily_entries
  add column if not exists subitem_state jsonb;
