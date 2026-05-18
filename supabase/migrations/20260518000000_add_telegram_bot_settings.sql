alter table public.settings
  add column if not exists telegram_bot_enabled boolean default false,
  add column if not exists telegram_reminders_enabled boolean default true,
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_last_seen_at timestamptz;

create index if not exists settings_telegram_bot_enabled_idx
on public.settings (telegram_bot_enabled)
where telegram_bot_enabled = true;
