alter table public.items
add column if not exists emoji text;

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
  updated_at timestamptz default now(),
  unique(task_id, date, source)
);

create index if not exists task_occurrences_user_id_idx on public.task_occurrences(user_id);
create index if not exists task_occurrences_task_id_idx on public.task_occurrences(task_id);
create index if not exists task_occurrences_date_idx on public.task_occurrences(date);
