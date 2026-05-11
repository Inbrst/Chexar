alter table public.items
add column if not exists group_name text;

create index if not exists items_user_group_name_idx
on public.items (user_id, group_name);
