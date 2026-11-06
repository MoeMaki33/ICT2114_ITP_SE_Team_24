-- Weekly Summary data-quality audit (read-only)
-- Project: pscwapylbjvulvsszdur
-- Run this before weekly_summary_cleanup.sql or weekly_summary_demo_seed.sql.
-- Every statement in this file is SELECT-only.

-- 1. Location quality and dependency counts.
with raw_counts as (
  select tpr.test_point_id, count(*)::bigint as reading_count
  from public.test_point_readings tpr
  group by tpr.test_point_id
)
select
  l.id,
  l.site_name,
  l.latitude,
  l.longitude,
  l.description,
  (btrim(coalesce(l.description, '')) = '') as has_blank_description,
  (lower(btrim(l.site_name)) in ('1', '2', '3', 't', 'test', 'test2')) as has_placeholder_name,
  (
    (l.latitude, l.longitude) in ((1::numeric, 1::numeric), (2::numeric, 2::numeric), (3::numeric, 3::numeric))
    or l.latitude not between -90 and 90
    or l.longitude not between -180 and 180
  ) as has_placeholder_or_invalid_coordinates,
  count(tp.id) as test_point_count,
  count(tp.id) filter (where tp.is_active) as active_test_point_count,
  coalesce(sum(rc.reading_count), 0) as raw_reading_count
from public.locations l
left join public.test_points tp on tp.location_id = l.id
left join raw_counts rc on rc.test_point_id = tp.id
group by l.id
order by l.site_name collate "C";

-- 2. Test Point dependency, history, assignment and current-position audit.
with raw_counts as (
  select
    tpr.test_point_id,
    count(*)::bigint as reading_count,
    min(rb.reading_ts) as earliest_reading_ts,
    max(rb.reading_ts) as latest_reading_ts
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  group by tpr.test_point_id
),
position_counts as (
  select
    test_point_id,
    count(*)::bigint as position_count,
    count(*) filter (where is_current)::bigint as current_position_count,
    max(coordinate_mode) filter (where is_current) as current_coordinate_mode,
    max(latitude) filter (where is_current) as current_latitude,
    max(longitude) filter (where is_current) as current_longitude
  from public.test_point_positions
  group by test_point_id
)
select
  tp.id,
  tp.label,
  tp.test_point_code,
  l.site_name,
  tp.type,
  tp.threshold_mv,
  tp.status,
  tp.is_active,
  tp.note,
  tp.assigned_engineer_id,
  u.full_name as assigned_engineer_name,
  u.is_active as assigned_engineer_active,
  coalesce(rc.reading_count, 0) as raw_reading_count,
  rc.earliest_reading_ts,
  rc.latest_reading_ts,
  coalesce(pc.position_count, 0) as position_count,
  coalesce(pc.current_position_count, 0) as current_position_count,
  pc.current_coordinate_mode,
  pc.current_latitude,
  pc.current_longitude,
  (lower(btrim(tp.label)) ~ '^(1|2|3|23|t|t2|test|test2|test3|test23|test33)$') as has_placeholder_label
from public.test_points tp
join public.locations l on l.id = tp.location_id
left join public.users u on u.id = tp.assigned_engineer_id
left join raw_counts rc on rc.test_point_id = tp.id
left join position_counts pc on pc.test_point_id = tp.id
order by l.site_name collate "C", tp.label collate "C", tp.id;

-- 3. Labels duplicated globally (the schema only enforces location + label uniqueness).
select
  lower(btrim(tp.label)) as normalised_label,
  count(*) as duplicate_count,
  jsonb_agg(
    jsonb_build_object(
      'id', tp.id,
      'label', tp.label,
      'location', l.site_name,
      'is_active', tp.is_active
    )
    order by l.site_name, tp.id
  ) as records
from public.test_points tp
join public.locations l on l.id = tp.location_id
group by lower(btrim(tp.label))
having count(*) > 1
order by normalised_label;

-- 4. Active points with no raw readings.
select tp.id, tp.label, l.site_name, tp.created_at
from public.test_points tp
join public.locations l on l.id = tp.location_id
where tp.is_active
  and not exists (
    select 1
    from public.test_point_readings tpr
    where tpr.test_point_id = tp.id
  )
order by l.site_name, tp.label;

-- 5. Raw reading counts by Singapore reporting week.
select
  date_trunc('week', rb.reading_ts at time zone 'Asia/Singapore')::date as week_start,
  count(tpr.id) as raw_reading_count,
  count(distinct tpr.test_point_id) as test_point_count,
  min(rb.reading_ts) as earliest_reading_ts,
  max(rb.reading_ts) as latest_reading_ts
from public.reading_batches rb
join public.test_point_readings tpr on tpr.batch_id = rb.id
group by 1
order by 1;

-- 6. Daily summary counts by week.
select
  date_trunc('week', ds.summary_date::timestamp)::date as week_start,
  count(*) as daily_summary_count,
  sum(ds.reading_count) as represented_reading_count,
  count(distinct ds.test_point_id) as test_point_count
from public.daily_summaries ds
group by 1
order by 1;

-- 7. Weekly summary counts by week.
select
  ws.week_start_date,
  count(*) as weekly_summary_count,
  sum(ws.reading_count) as represented_reading_count,
  count(distinct ws.test_point_id) as test_point_count
from public.weekly_summaries ws
group by ws.week_start_date
order by ws.week_start_date;

-- 8. Raw/daily/weekly consistency for every materialised Test Point week.
with raw as (
  select
    tpr.test_point_id,
    date_trunc('week', rb.reading_ts at time zone 'Asia/Singapore')::date as week_start,
    count(*)::bigint as raw_count
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  group by 1, 2
),
daily as (
  select
    test_point_id,
    date_trunc('week', summary_date::timestamp)::date as week_start,
    sum(reading_count)::bigint as daily_count
  from public.daily_summaries
  group by 1, 2
),
weekly as (
  select test_point_id, week_start_date as week_start, reading_count::bigint as weekly_count
  from public.weekly_summaries
)
select
  coalesce(r.test_point_id, d.test_point_id, w.test_point_id) as test_point_id,
  tp.label,
  l.site_name,
  coalesce(r.week_start, d.week_start, w.week_start) as week_start,
  coalesce(r.raw_count, 0) as raw_count,
  coalesce(d.daily_count, 0) as daily_count,
  coalesce(w.weekly_count, 0) as weekly_count,
  coalesce(r.raw_count, 0) = coalesce(d.daily_count, 0)
    and coalesce(r.raw_count, 0) = coalesce(w.weekly_count, 0) as counts_match
from raw r
full join daily d using (test_point_id, week_start)
full join weekly w using (test_point_id, week_start)
join public.test_points tp on tp.id = coalesce(r.test_point_id, d.test_point_id, w.test_point_id)
join public.locations l on l.id = tp.location_id
order by week_start, l.site_name, tp.label;

-- 9. Current-position and assignment totals for active points.
select
  count(*) as active_test_points,
  count(*) filter (where tp.assigned_engineer_id is not null) as assigned_engineer_count,
  count(*) filter (where p.coordinate_mode = 'gps') as gps_count,
  count(*) filter (where p.coordinate_mode = 'relative') as relative_count,
  count(*) filter (where p.coordinate_mode = 'gps_and_relative') as gps_and_relative_count,
  count(*) filter (where p.test_point_id is null or p.coordinate_mode = 'unmapped') as unmapped_count
from public.test_points tp
left join public.test_point_positions p
  on p.test_point_id = tp.id
 and p.is_current
where tp.is_active;

-- 10. Synthetic data from this seed version only.
select
  rb.source_file,
  rb.upload_method,
  count(distinct rb.id) as batch_count,
  count(tpr.id) as reading_count,
  min(rb.reading_ts) as earliest_reading_ts,
  max(rb.reading_ts) as latest_reading_ts
from public.reading_batches rb
left join public.test_point_readings tpr on tpr.batch_id = rb.id
where rb.source_file = 'synthetic_weekly_summary_demo_v1'
group by rb.source_file, rb.upload_method;

-- 11. Orphan checks (all expected to be zero).
select 'test_point_readings_without_batch' as orphan_type, count(*)::bigint as orphan_count
from public.test_point_readings tpr
left join public.reading_batches rb on rb.id = tpr.batch_id
where rb.id is null
union all
select 'test_point_readings_without_test_point', count(*)::bigint
from public.test_point_readings tpr
left join public.test_points tp on tp.id = tpr.test_point_id
where tp.id is null
union all
select 'test_points_without_location', count(*)::bigint
from public.test_points tp
left join public.locations l on l.id = tp.location_id
where l.id is null
union all
select 'daily_summaries_without_test_point', count(*)::bigint
from public.daily_summaries ds
left join public.test_points tp on tp.id = ds.test_point_id
where tp.id is null
union all
select 'weekly_summaries_without_test_point', count(*)::bigint
from public.weekly_summaries ws
left join public.test_points tp on tp.id = ws.test_point_id
where tp.id is null;

-- 12. Refresh queue and future-data guard.
select
  (select count(*) from public.summary_refresh_queue) as refresh_queue_count,
  (select count(*) from public.reading_batches where reading_ts > now()) as future_batch_count;
