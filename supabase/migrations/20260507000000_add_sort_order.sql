alter table public.items
add column if not exists sort_order numeric default 0;

create index if not exists items_user_sort_order_idx
on public.items (user_id, sort_order);
