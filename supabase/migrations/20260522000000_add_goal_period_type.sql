-- Persist the user-selected period for quantitative goals.
-- Safe to run repeatedly; it does not delete or overwrite progress data.

alter table public.items
  add column if not exists period_type text;

update public.items
set period_type = case
  when end_date is not null and start_date is not null and end_date = start_date then 'today'
  when end_date is not null and start_date is not null and end_date = (start_date + interval '6 days')::date then 'week'
  when end_date = date '2099-12-31' then 'forever'
  when end_date is not null
    and start_date is not null
    and end_date = (date_trunc('month', start_date)::date + interval '1 month - 1 day')::date then 'month'
  else 'custom'
end
where tracking_type = 'quantity'
  and period_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'items_period_type_check'
      and conrelid = 'public.items'::regclass
  ) then
    alter table public.items
      add constraint items_period_type_check
      check (period_type is null or period_type in ('today', 'week', 'month', 'forever', 'custom')) not valid;
  end if;
end $$;

create index if not exists items_user_period_type_idx
on public.items (user_id, period_type);
