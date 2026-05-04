-- MVP persistence uses Telegram WebApp user identity, not Supabase Auth.
-- Keep RLS disabled until app-level Telegram initData verification / RLS policies are added.
alter table public.users disable row level security;
alter table public.items disable row level security;
alter table public.daily_entries disable row level security;
alter table public.settings disable row level security;
