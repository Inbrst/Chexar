alter table public.users
  add column if not exists last_name text,
  add column if not exists photo_url text,
  add column if not exists language_code text;
