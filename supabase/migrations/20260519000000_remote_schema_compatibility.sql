-- Chexar remote Supabase compatibility catch-up.
-- Safe to run manually in Supabase SQL Editor.
-- It only creates missing tables/columns/indexes/policies and does not delete user data.

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
  updated_at timestamptz default now()
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

alter table public.users
  add column if not exists telegram_id text,
  add column if not exists username text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists photo_url text,
  add column if not exists language_code text,
  add column if not exists created_at timestamptz default now();

alter table public.users
  alter column id set default gen_random_uuid(),
  alter column created_at set default now();

alter table public.items
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists title text,
  add column if not exists group_name text,
  add column if not exists note text,
  add column if not exists emoji text,
  add column if not exists icon text,
  add column if not exists tracking_type text,
  add column if not exists repeat_mode text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists selected_days int[],
  add column if not exists due_time time,
  add column if not exists target_value numeric,
  add column if not exists unit text,
  add column if not exists quick_add_values numeric[],
  add column if not exists subitems jsonb,
  add column if not exists sort_order numeric default 0,
  add column if not exists timer_minutes numeric,
  add column if not exists archived boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.items
  alter column id set default gen_random_uuid(),
  alter column sort_order set default 0,
  alter column archived set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.daily_entries
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists item_id uuid references public.items(id) on delete cascade,
  add column if not exists date date,
  add column if not exists checked boolean,
  add column if not exists value_added numeric default 0,
  add column if not exists note text,
  add column if not exists subitem_state jsonb,
  add column if not exists timer_seconds_done numeric default 0,
  add column if not exists timer_completed boolean default false,
  add column if not exists completed_at timestamptz,
  add column if not exists is_late boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.daily_entries
  alter column id set default gen_random_uuid(),
  alter column value_added set default 0,
  alter column timer_seconds_done set default 0,
  alter column timer_completed set default false,
  alter column is_late set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.settings
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists language text default 'ru',
  add column if not exists theme text default 'dark',
  add column if not exists tips_enabled boolean default true,
  add column if not exists onboarding_completed boolean default false,
  add column if not exists telegram_bot_enabled boolean default false,
  add column if not exists telegram_reminders_enabled boolean default true,
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_last_seen_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.settings
  alter column language set default 'ru',
  alter column theme set default 'dark',
  alter column tips_enabled set default true,
  alter column onboarding_completed set default false,
  alter column telegram_bot_enabled set default false,
  alter column telegram_reminders_enabled set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();

create table if not exists public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.items(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'skipped')),
  source text not null default 'carry_over',
  moved_from_date date,
  is_carry_over boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.task_occurrences
  add column if not exists task_id uuid references public.items(id) on delete cascade,
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists date date,
  add column if not exists status text default 'active',
  add column if not exists source text default 'carry_over',
  add column if not exists moved_from_date date,
  add column if not exists is_carry_over boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.task_occurrences
  alter column id set default gen_random_uuid(),
  alter column status set default 'active',
  alter column source set default 'carry_over',
  alter column is_carry_over set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'items_tracking_type_check'
      and conrelid = 'public.items'::regclass
  ) then
    alter table public.items
      add constraint items_tracking_type_check
      check (tracking_type in ('checkbox', 'quantity')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'items_repeat_mode_check'
      and conrelid = 'public.items'::regclass
  ) then
    alter table public.items
      add constraint items_repeat_mode_check
      check (repeat_mode in ('once', 'daily', 'weekdays', 'selected_days')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'task_occurrences_status_check'
      and conrelid = 'public.task_occurrences'::regclass
  ) then
    alter table public.task_occurrences
      add constraint task_occurrences_status_check
      check (status in ('active', 'completed', 'skipped')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_telegram_id_key'
      and conrelid = 'public.users'::regclass
  ) then
    if not exists (
      select telegram_id
      from public.users
      where telegram_id is not null
      group by telegram_id
      having count(*) > 1
    ) then
      alter table public.users add constraint users_telegram_id_key unique (telegram_id);
    else
      raise notice 'Skipped users.telegram_id unique constraint because duplicate telegram_id values exist.';
    end if;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_entries_item_id_date_key'
      and conrelid = 'public.daily_entries'::regclass
  ) then
    if not exists (
      select item_id, date
      from public.daily_entries
      where item_id is not null and date is not null
      group by item_id, date
      having count(*) > 1
    ) then
      alter table public.daily_entries add constraint daily_entries_item_id_date_key unique (item_id, date);
    else
      raise notice 'Skipped daily_entries(item_id, date) unique constraint because duplicate rows exist.';
    end if;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'task_occurrences_task_id_date_source_key'
      and conrelid = 'public.task_occurrences'::regclass
  ) then
    if not exists (
      select task_id, date, source
      from public.task_occurrences
      where task_id is not null and date is not null and source is not null
      group by task_id, date, source
      having count(*) > 1
    ) then
      alter table public.task_occurrences add constraint task_occurrences_task_id_date_source_key unique (task_id, date, source);
    else
      raise notice 'Skipped task_occurrences(task_id, date, source) unique constraint because duplicate rows exist.';
    end if;
  end if;
end $$;

create index if not exists users_telegram_id_idx on public.users(telegram_id);
create index if not exists items_user_id_idx on public.items(user_id);
create index if not exists items_user_sort_order_idx on public.items(user_id, sort_order);
create index if not exists items_user_group_name_idx on public.items(user_id, group_name);
create index if not exists items_user_archived_idx on public.items(user_id, archived);
create index if not exists daily_entries_user_id_idx on public.daily_entries(user_id);
create index if not exists daily_entries_item_id_idx on public.daily_entries(item_id);
create index if not exists daily_entries_date_idx on public.daily_entries(date);
create index if not exists daily_entries_user_date_idx on public.daily_entries(user_id, date);
create index if not exists task_occurrences_user_id_idx on public.task_occurrences(user_id);
create index if not exists task_occurrences_task_id_idx on public.task_occurrences(task_id);
create index if not exists task_occurrences_date_idx on public.task_occurrences(date);
create index if not exists task_occurrences_user_date_idx on public.task_occurrences(user_id, date);
create index if not exists settings_telegram_bot_enabled_idx
  on public.settings (telegram_bot_enabled)
  where telegram_bot_enabled = true;
create index if not exists settings_telegram_reminders_enabled_idx
  on public.settings (telegram_reminders_enabled)
  where telegram_bot_enabled = true and telegram_reminders_enabled = true;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table
  public.users,
  public.items,
  public.daily_entries,
  public.settings,
  public.task_occurrences
to anon, authenticated;

-- Current Chexar uses Telegram WebApp identity / browser fallback, not Supabase Auth.
-- Keeping RLS disabled matches the current app and avoids breaking remote persistence.
alter table public.users disable row level security;
alter table public.items disable row level security;
alter table public.daily_entries disable row level security;
alter table public.settings disable row level security;
alter table public.task_occurrences disable row level security;

-- Permissive policies are created only as compatibility placeholders.
-- They are inactive while RLS is disabled, but prevent missing-policy surprises
-- if RLS is later enabled before proper Telegram initData verification exists.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'chexar_public_access_users') then
    create policy chexar_public_access_users on public.users for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'items' and policyname = 'chexar_public_access_items') then
    create policy chexar_public_access_items on public.items for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'daily_entries' and policyname = 'chexar_public_access_daily_entries') then
    create policy chexar_public_access_daily_entries on public.daily_entries for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'settings' and policyname = 'chexar_public_access_settings') then
    create policy chexar_public_access_settings on public.settings for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'task_occurrences' and policyname = 'chexar_public_access_task_occurrences') then
    create policy chexar_public_access_task_occurrences on public.task_occurrences for all to anon, authenticated using (true) with check (true);
  end if;
end $$;
