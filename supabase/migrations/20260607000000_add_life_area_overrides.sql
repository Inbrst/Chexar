-- Optional manual life-area classification for Direction Review.
-- This migration intentionally does not change RLS or existing policies.

alter table public.items
  add column if not exists life_area_override text,
  add column if not exists life_area_custom_label text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'items_life_area_override_check'
      and conrelid = 'public.items'::regclass
  ) then
    alter table public.items
      add constraint items_life_area_override_check
      check (
        life_area_override is null
        or life_area_override in (
          'learning',
          'health',
          'work',
          'personal',
          'finance',
          'creativity',
          'custom'
        )
      ) not valid;
  end if;
end $$;
