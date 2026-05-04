create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id text unique,
  username text,
  first_name text,
  created_at timestamptz default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  title text not null,
  note text,
  icon text,
  tracking_type text not null check (tracking_type in ('checkbox', 'quantity')),
  repeat_mode text not null check (repeat_mode in ('once', 'daily', 'weekdays', 'selected_days')),
  start_date date not null,
  end_date date,
  selected_days int[],
  target_value numeric,
  unit text,
  quick_add_values numeric[],
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  date date not null,
  checked boolean,
  value_added numeric default 0,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(item_id, date)
);

create table if not exists public.settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  language text default 'ru',
  theme text default 'dark',
  tips_enabled boolean default true,
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists users_telegram_id_idx on public.users(telegram_id);
create index if not exists items_user_id_idx on public.items(user_id);
create index if not exists daily_entries_user_id_idx on public.daily_entries(user_id);
create index if not exists daily_entries_item_id_idx on public.daily_entries(item_id);
create index if not exists daily_entries_date_idx on public.daily_entries(date);
