create table if not exists public.telegram_star_donations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  telegram_id text,
  chat_id text,
  currency text not null default 'XTR',
  total_amount integer not null default 0,
  invoice_payload text,
  telegram_payment_charge_id text unique,
  provider_payment_charge_id text,
  created_at timestamptz default now()
);

create index if not exists telegram_star_donations_user_id_idx
  on public.telegram_star_donations (user_id);

create index if not exists telegram_star_donations_telegram_id_idx
  on public.telegram_star_donations (telegram_id);

create index if not exists telegram_star_donations_created_at_idx
  on public.telegram_star_donations (created_at desc);

alter table public.telegram_star_donations disable row level security;
