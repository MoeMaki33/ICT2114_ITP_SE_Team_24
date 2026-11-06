-- Available-week reading totals must use the same active Test Point scope as
-- the weekly and daily page datasets. Inactive history remains stored but no
-- longer inflates the selector count.
create or replace function public.get_weekly_summary_available_weeks(
  p_timezone text default 'Asia/Singapore',
  p_limit integer default 32
)
returns table (
  week_start_date date,
  week_end_date date,
  reading_count bigint,
  first_reading_ts timestamptz,
  latest_reading_ts timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    ws.week_start_date,
    ws.week_end_date,
    sum(ws.reading_count)::bigint as reading_count,
    min(ws.first_reading_ts) as first_reading_ts,
    max(ws.latest_reading_ts) as latest_reading_ts
  from public.weekly_summaries ws
  join public.test_points tp
    on tp.id = ws.test_point_id
   and tp.is_active = true
  where ws.reading_count > 0
  group by ws.week_start_date, ws.week_end_date
  order by ws.week_start_date desc
  limit greatest(1, least(coalesce(p_limit, 32), 104));
$$;
