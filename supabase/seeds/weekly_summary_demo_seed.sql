-- Idempotent Weekly Summary synthetic demonstration seed.
-- These rows are NOT client measurements.
-- Stable marker: synthetic_weekly_summary_demo_v1

begin;

create or replace function pg_temp.weekly_demo_uuid(seed_text text)
returns uuid
language sql
immutable
strict
as $$
  select (
    substr(md5(seed_text), 1, 8) || '-' ||
    substr(md5(seed_text), 9, 4) || '-' ||
    '4' || substr(md5(seed_text), 14, 3) || '-' ||
    '8' || substr(md5(seed_text), 18, 3) || '-' ||
    substr(md5(seed_text), 21, 12)
  )::uuid;
$$;

do $$
declare
  v_engineer_count integer;
  v_preserved_reading_count bigint;
begin
  select count(*)
  into v_engineer_count
  from public.users
  where id = 'bb00ac74-9b8b-4371-b2f8-6a3d7e60f57c'::uuid
    and role = 'corrosion_engineer'
    and is_active = true;

  if v_engineer_count <> 1 then
    raise exception 'The audited active corrosion engineer is unavailable; seed cancelled.';
  end if;

  select count(*)
  into v_preserved_reading_count
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where tpr.test_point_id = any(array[
    '135c1e2b-b724-4403-8907-c2b6e815ff3b'::uuid,
    '31f570b6-a24a-4bba-a875-06f5d9eb40b6'::uuid,
    '6995cf3f-a817-4e1e-bc60-fe472eb38dbe'::uuid,
    'fda4550e-ab01-420f-b868-3ff3030f3915'::uuid
  ])
    and rb.source_file is distinct from 'synthetic_weekly_summary_demo_v1';

  if v_preserved_reading_count < 12132 then
    raise exception 'Historical Jalan Ban preservation baseline failed; seed cancelled.';
  end if;
end;
$$;

-- The only Location created by this seed. Its description and coordinates are
-- explicitly marked as synthetic demonstration data.
insert into public.locations (
  id,
  site_name,
  latitude,
  longitude,
  description,
  created_by,
  updated_at
)
values (
  pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:location:Demo Tank Farm - West'),
  'Demo Tank Farm - West',
  1.300600,
  103.842900,
  'Synthetic demonstration Location near Singapore. Coordinates and readings are for UI testing only and are not client data.',
  'bb00ac74-9b8b-4371-b2f8-6a3d7e60f57c'::uuid,
  now()
)
on conflict (site_name) do update set
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  description = excluded.description,
  updated_at = now();

-- Add eight deterministic points. Eight audited points are retained by UUID
-- and were normalised by weekly_summary_cleanup.sql.
with new_points(code, location_name, point_type, note_text) as (
  values
    ('JBS-TP-003', 'Jalan Besar', 'stationary', 'Synthetic Weekly Summary demonstration point; readings are not client measurements.'),
    ('JBS-TP-004', 'Jalan Besar', 'variable', 'Synthetic Weekly Summary No Data scenario; comparison-week readings only.'),
    ('PAN-TP-003', 'Pipeline A - North', 'variable', 'Synthetic Weekly Summary demonstration point; readings are not client measurements.'),
    ('PAN-TP-004', 'Pipeline A - North', 'stationary', 'Synthetic Weekly Summary No Data scenario; comparison-week readings only.'),
    ('DTW-TP-001', 'Demo Tank Farm - West', 'stationary', 'Synthetic protected and stable Weekly Summary scenario.'),
    ('DTW-TP-002', 'Demo Tank Farm - West', 'stationary', 'Synthetic protected but declining Weekly Summary scenario.'),
    ('DTW-TP-003', 'Demo Tank Farm - West', 'variable', 'Synthetic protected and improving Weekly Summary scenario.'),
    ('DTW-TP-004', 'Demo Tank Farm - West', 'variable', 'Synthetic repeated threshold-crossing Weekly Summary scenario.')
)
insert into public.test_points (
  id,
  location_id,
  label,
  type,
  threshold_mv,
  status,
  is_active,
  assigned_engineer_id,
  test_point_code,
  note,
  latitude,
  longitude
)
select
  pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:test-point:' || np.code),
  l.id,
  np.code,
  np.point_type,
  -850,
  'unknown',
  true,
  'bb00ac74-9b8b-4371-b2f8-6a3d7e60f57c'::uuid,
  np.code,
  np.note_text,
  null,
  null
from new_points np
join public.locations l on l.site_name = np.location_name
on conflict (id) do update set
  location_id = excluded.location_id,
  label = excluded.label,
  type = excluded.type,
  threshold_mv = excluded.threshold_mv,
  is_active = true,
  assigned_engineer_id = excluded.assigned_engineer_id,
  test_point_code = excluded.test_point_code,
  note = excluded.note,
  latitude = null,
  longitude = null;

create temporary table seed_weekly_demo_points (
  test_point_id uuid primary key,
  code text not null unique,
  location_id uuid not null,
  scenario text not null,
  comparison_base_mv integer not null,
  has_selected_week_data boolean not null
) on commit drop;

insert into seed_weekly_demo_points (
  test_point_id,
  code,
  location_id,
  scenario,
  comparison_base_mv,
  has_selected_week_data
)
select v.test_point_id, v.code, l.id, v.scenario, v.comparison_base_mv, v.has_selected_week_data
from (
  values
    ('135c1e2b-b724-4403-8907-c2b6e815ff3b'::uuid, 'JBN-TP-001', 'Jalan Ban', 'protected_stable', -920, true),
    ('31f570b6-a24a-4bba-a875-06f5d9eb40b6'::uuid, 'JBN-TP-002', 'Jalan Ban', 'improving', -875, true),
    ('6995cf3f-a817-4e1e-bc60-fe472eb38dbe'::uuid, 'JBN-TP-003', 'Jalan Ban', 'declining', -960, true),
    ('fda4550e-ab01-420f-b868-3ff3030f3915'::uuid, 'JBN-TP-004', 'Jalan Ban', 'crossing_warning', -870, true),
    ('71bfcb59-4d46-4f4e-aa69-82a9dd0f2116'::uuid, 'JBS-TP-001', 'Jalan Besar', 'unprotected', -820, true),
    ('9ceff82f-c341-4882-be40-60d7797b1e75'::uuid, 'JBS-TP-002', 'Jalan Besar', 'warning', -835, true),
    (pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:test-point:JBS-TP-003'), 'JBS-TP-003', 'Jalan Besar', 'protected_stable', -915, true),
    (pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:test-point:JBS-TP-004'), 'JBS-TP-004', 'Jalan Besar', 'no_current', -905, false),
    ('747b4a41-6211-4dd4-a5e8-cd3316a2f751'::uuid, 'PAN-TP-001', 'Pipeline A - North', 'unprotected', -860, true),
    ('e8ec011c-85fa-493e-80d1-d5341e30d400'::uuid, 'PAN-TP-002', 'Pipeline A - North', 'warning', -830, true),
    (pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:test-point:PAN-TP-003'), 'PAN-TP-003', 'Pipeline A - North', 'improving', -880, true),
    (pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:test-point:PAN-TP-004'), 'PAN-TP-004', 'Pipeline A - North', 'no_current', -920, false),
    (pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:test-point:DTW-TP-001'), 'DTW-TP-001', 'Demo Tank Farm - West', 'protected_stable', -930, true),
    (pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:test-point:DTW-TP-002'), 'DTW-TP-002', 'Demo Tank Farm - West', 'declining', -960, true),
    (pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:test-point:DTW-TP-003'), 'DTW-TP-003', 'Demo Tank Farm - West', 'improving', -875, true),
    (pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:test-point:DTW-TP-004'), 'DTW-TP-004', 'Demo Tank Farm - West', 'crossing_protected', -855, true)
) as v(test_point_id, code, location_name, scenario, comparison_base_mv, has_selected_week_data)
join public.locations l on l.site_name = v.location_name;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from seed_weekly_demo_points s
  join public.test_points tp on tp.id = s.test_point_id
  where tp.is_active and tp.label = s.code and tp.test_point_code = s.code;

  if v_count <> 16 then
    raise exception 'Expected 16 active, uniquely coded demo Test Points; found %.', v_count;
  end if;
end;
$$;

-- Replace only data created by this exact seed version.
delete from public.reading_batches
where source_file = 'synthetic_weekly_summary_demo_v1';

-- Replace only position records created by this exact seed version. Any later
-- Admin-entered current position uses a different source and is retained.
delete from public.test_point_positions
where coordinate_source = 'synthetic_weekly_summary_demo_v1';

create temporary table seed_weekly_position_profiles (
  code text primary key,
  coordinate_mode text not null,
  latitude numeric,
  longitude numeric,
  relative_x_m numeric,
  relative_y_m numeric,
  relative_z_m numeric,
  chainage_m numeric,
  accuracy_m numeric
) on commit drop;

insert into seed_weekly_position_profiles values
  ('JBN-TP-001', 'relative', null, null, 0, 0, 0, 0, null),
  ('JBN-TP-002', 'relative', null, null, 25, 4, 0, 25, null),
  ('JBN-TP-003', 'relative', null, null, 50, -3, 0, 50, null),
  ('JBN-TP-004', 'relative', null, null, 75, 6, 0, 75, null),
  ('JBS-TP-001', 'relative', null, null, 8, 3, 0, 8, null),
  ('JBS-TP-002', 'relative', null, null, 30, -2, 0, 30, null),
  ('JBS-TP-003', 'relative', null, null, 55, 5, 0, 55, null),
  ('JBS-TP-004', 'unmapped', null, null, null, null, null, null, null),
  ('PAN-TP-001', 'relative', null, null, 12, 2, -1, 12, null),
  ('PAN-TP-002', 'relative', null, null, 38, -4, -1, 38, null),
  ('PAN-TP-003', 'relative', null, null, 64, 3, -1, 64, null),
  ('PAN-TP-004', 'unmapped', null, null, null, null, null, null, null),
  ('DTW-TP-001', 'gps', 1.300720, 103.842760, null, null, null, null, 4),
  ('DTW-TP-002', 'gps_and_relative', 1.300910, 103.843040, 18, 5, 0, 18, 4),
  ('DTW-TP-003', 'gps', 1.300430, 103.843180, null, null, null, null, 5),
  ('DTW-TP-004', 'unmapped', null, null, null, null, null, null, null);

insert into public.test_point_positions (
  id,
  test_point_id,
  coordinate_mode,
  latitude,
  longitude,
  relative_x_m,
  relative_y_m,
  relative_z_m,
  chainage_m,
  coordinate_accuracy_m,
  coordinate_source,
  is_current,
  updated_by,
  valid_from,
  valid_to
)
select
  pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:position:' || p.code),
  s.test_point_id,
  p.coordinate_mode,
  p.latitude,
  p.longitude,
  p.relative_x_m,
  p.relative_y_m,
  p.relative_z_m,
  p.chainage_m,
  p.accuracy_m,
  'synthetic_weekly_summary_demo_v1',
  true,
  'bb00ac74-9b8b-4371-b2f8-6a3d7e60f57c'::uuid,
  '2026-07-01 00:00:00+08'::timestamptz,
  null
from seed_weekly_position_profiles p
join seed_weekly_demo_points s using (code)
where not exists (
  select 1
  from public.test_point_positions current_position
  where current_position.test_point_id = s.test_point_id
    and current_position.is_current
);

create temporary table seed_weekly_demo_batches (
  batch_id uuid primary key,
  location_id uuid not null,
  reporting_date date not null,
  period_name text not null,
  slot_index integer not null,
  reading_ts timestamptz not null
) on commit drop;

with reporting_dates as (
  select day::date as reporting_date, 'comparison'::text as period_name
  from generate_series('2026-07-06'::date, '2026-07-12'::date, interval '1 day') day
  union all
  select day::date, 'selected'::text
  from generate_series('2026-07-13'::date, '2026-07-18'::date, interval '1 day') day
),
slots(slot_index, hour_of_day) as (
  values (0, 1), (1, 9), (2, 15)
),
demo_locations as (
  select distinct location_id from seed_weekly_demo_points
)
insert into seed_weekly_demo_batches (
  batch_id,
  location_id,
  reporting_date,
  period_name,
  slot_index,
  reading_ts
)
select
  pg_temp.weekly_demo_uuid(
    'synthetic_weekly_summary_demo_v1:batch:' || dl.location_id::text || ':' || rd.reporting_date::text || ':' || s.slot_index::text
  ),
  dl.location_id,
  rd.reporting_date,
  rd.period_name,
  s.slot_index,
  make_timestamptz(
    extract(year from rd.reporting_date)::integer,
    extract(month from rd.reporting_date)::integer,
    extract(day from rd.reporting_date)::integer,
    s.hour_of_day,
    0,
    0,
    'Asia/Singapore'
  )
from reporting_dates rd
cross join slots s
cross join demo_locations dl;

insert into public.reading_batches (
  id,
  location_id,
  reading_ts,
  entered_by,
  upload_method,
  temperature_c,
  medium_conductivity,
  ph,
  dissolved_oxygen,
  power_watts,
  source_file
)
select
  b.batch_id,
  b.location_id,
  b.reading_ts,
  'bb00ac74-9b8b-4371-b2f8-6a3d7e60f57c'::uuid,
  'bulk',
  round((27.0 + (extract(doy from b.reporting_date)::integer % 5) * 0.3 + b.slot_index * 0.2)::numeric, 1),
  round((4.2 + (extract(doy from b.reporting_date)::integer % 4) * 0.2 + b.slot_index * 0.1)::numeric, 1),
  round((6.9 + (extract(doy from b.reporting_date)::integer % 4) * 0.1)::numeric, 1),
  round((5.8 + (extract(doy from b.reporting_date)::integer % 5) * 0.2)::numeric, 1),
  112 + (extract(doy from b.reporting_date)::integer % 6) * 3 + b.slot_index,
  'synthetic_weekly_summary_demo_v1'
from seed_weekly_demo_batches b
on conflict (id) do update set
  reading_ts = excluded.reading_ts,
  temperature_c = excluded.temperature_c,
  medium_conductivity = excluded.medium_conductivity,
  ph = excluded.ph,
  dissolved_oxygen = excluded.dissolved_oxygen,
  power_watts = excluded.power_watts,
  source_file = excluded.source_file;

with candidate_readings as (
  select
    b.batch_id,
    p.test_point_id,
    p.code,
    p.scenario,
    p.comparison_base_mv,
    b.period_name,
    b.reporting_date,
    b.slot_index,
    case
      when b.period_name = 'comparison' then
        p.comparison_base_mv
          + (((b.reporting_date - '2026-07-06'::date) * 3 + b.slot_index) % 5) - 2
      when p.scenario = 'protected_stable' then
        -922 + ((((b.reporting_date - '2026-07-13'::date) * 3 + b.slot_index) % 5) - 2)
      when p.scenario = 'improving' then
        -875 - ((b.reporting_date - '2026-07-13'::date) * 3 + b.slot_index) * 3
      when p.scenario = 'declining' then
        -980 + ((b.reporting_date - '2026-07-13'::date) * 3 + b.slot_index) * 6
      when p.scenario = 'crossing_warning' then
        case (((b.reporting_date - '2026-07-13'::date) * 3 + b.slot_index) % 4)
          when 0 then -860 when 1 then -840 when 2 then -865 else -835 end
      when p.scenario = 'unprotected' then
        -790 + ((b.reporting_date - '2026-07-13'::date) * 3 + b.slot_index) * 5
      when p.scenario = 'warning' then
        -842 + (b.reporting_date - '2026-07-13'::date) * 2 + b.slot_index
      when p.scenario = 'crossing_protected' then
        case (((b.reporting_date - '2026-07-13'::date) * 3 + b.slot_index) % 4)
          when 0 then -840 when 1 then -865 when 2 then -835 else -870 end
      else p.comparison_base_mv
    end::integer as value_mv
  from seed_weekly_demo_batches b
  join seed_weekly_demo_points p on p.location_id = b.location_id
  where b.period_name = 'comparison'
     or p.has_selected_week_data
)
insert into public.test_point_readings (
  id,
  batch_id,
  test_point_id,
  value_mv,
  threshold_mv_snapshot
)
select
  pg_temp.weekly_demo_uuid('synthetic_weekly_summary_demo_v1:reading:' || cr.batch_id::text || ':' || cr.test_point_id::text),
  cr.batch_id,
  cr.test_point_id,
  cr.value_mv,
  -850
from candidate_readings cr
on conflict (batch_id, test_point_id) do update set
  value_mv = excluded.value_mv,
  threshold_mv_snapshot = excluded.threshold_mv_snapshot;

-- Refresh through the normal raw -> daily -> weekly pipeline. Dates with no
-- readings are included so stale summaries from earlier seed runs are removed.
do $$
declare
  v_point record;
  v_date date;
begin
  for v_point in select test_point_id from seed_weekly_demo_points loop
    for v_date in
      select day::date
      from generate_series('2026-07-06'::date, '2026-07-19'::date, interval '1 day') day
    loop
      perform public.refresh_daily_summary(v_point.test_point_id, v_date, 'Asia/Singapore');
    end loop;
    perform public.refresh_weekly_summary(v_point.test_point_id, '2026-07-06'::date, 5);
    perform public.refresh_weekly_summary(v_point.test_point_id, '2026-07-13'::date, 5);
  end loop;
end;
$$;

-- Keep the Test Point technical status aligned with the latest selected-week
-- reading. Warning remains a display status computed by the Weekly RPC.
update public.test_points tp
set status = case
  when ws.latest_reading_mv is null then 'unknown'
  when ws.latest_reading_mv <= -850 then 'protected'
  else 'unprotected'
end
from seed_weekly_demo_points p
left join public.weekly_summaries ws
  on ws.test_point_id = p.test_point_id
 and ws.week_start_date = '2026-07-13'::date
where tp.id = p.test_point_id;

-- Transaction postconditions and idempotency checks.
do $$
declare
  v_batch_count integer;
  v_reading_count integer;
  v_comparison_count integer;
  v_selected_count integer;
  v_inconsistent_count integer;
  v_future_count integer;
  v_preserved_reading_count bigint;
begin
  select count(*) into v_batch_count
  from public.reading_batches
  where source_file = 'synthetic_weekly_summary_demo_v1';

  select count(*) into v_reading_count
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where rb.source_file = 'synthetic_weekly_summary_demo_v1';

  select count(*) into v_comparison_count
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where rb.source_file = 'synthetic_weekly_summary_demo_v1'
    and (rb.reading_ts at time zone 'Asia/Singapore')::date between '2026-07-06' and '2026-07-12';

  select count(*) into v_selected_count
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where rb.source_file = 'synthetic_weekly_summary_demo_v1'
    and (rb.reading_ts at time zone 'Asia/Singapore')::date between '2026-07-13' and '2026-07-19';

  with raw as (
    select
      p.test_point_id,
      w.week_start,
      count(rb.id)::bigint as reading_count
    from seed_weekly_demo_points p
    cross join (values ('2026-07-06'::date), ('2026-07-13'::date)) w(week_start)
    left join public.test_point_readings tpr on tpr.test_point_id = p.test_point_id
    left join public.reading_batches rb
      on rb.id = tpr.batch_id
     and (rb.reading_ts at time zone 'Asia/Singapore')::date >= w.week_start
     and (rb.reading_ts at time zone 'Asia/Singapore')::date < w.week_start + 7
    group by p.test_point_id, w.week_start
  ),
  daily as (
    select
      p.test_point_id,
      w.week_start,
      coalesce(sum(ds.reading_count), 0)::bigint as reading_count
    from seed_weekly_demo_points p
    cross join (values ('2026-07-06'::date), ('2026-07-13'::date)) w(week_start)
    left join public.daily_summaries ds
      on ds.test_point_id = p.test_point_id
     and ds.summary_date >= w.week_start
     and ds.summary_date < w.week_start + 7
    group by p.test_point_id, w.week_start
  ),
  weekly as (
    select
      p.test_point_id,
      w.week_start,
      coalesce(ws.reading_count, 0)::bigint as reading_count
    from seed_weekly_demo_points p
    cross join (values ('2026-07-06'::date), ('2026-07-13'::date)) w(week_start)
    left join public.weekly_summaries ws
      on ws.test_point_id = p.test_point_id
     and ws.week_start_date = w.week_start
  )
  select count(*) into v_inconsistent_count
  from raw r
  join daily d using (test_point_id, week_start)
  join weekly w using (test_point_id, week_start)
  where r.reading_count <> d.reading_count
     or r.reading_count <> w.reading_count;

  select count(*) into v_future_count
  from public.reading_batches
  where source_file = 'synthetic_weekly_summary_demo_v1'
    and reading_ts > now();

  select count(*) into v_preserved_reading_count
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where tpr.test_point_id = any(array[
    '135c1e2b-b724-4403-8907-c2b6e815ff3b'::uuid,
    '31f570b6-a24a-4bba-a875-06f5d9eb40b6'::uuid,
    '6995cf3f-a817-4e1e-bc60-fe472eb38dbe'::uuid,
    'fda4550e-ab01-420f-b868-3ff3030f3915'::uuid
  ])
    and rb.source_file is distinct from 'synthetic_weekly_summary_demo_v1';

  if v_batch_count <> 156 then
    raise exception 'Expected 156 synthetic batches, found %.', v_batch_count;
  end if;
  if v_reading_count <> 588 or v_comparison_count <> 336 or v_selected_count <> 252 then
    raise exception 'Unexpected synthetic reading totals: total %, comparison %, selected %.', v_reading_count, v_comparison_count, v_selected_count;
  end if;
  if v_inconsistent_count <> 0 then
    raise exception 'Raw/daily/weekly reading counts are inconsistent for % point-weeks.', v_inconsistent_count;
  end if;
  if v_future_count <> 0 then
    raise exception 'Synthetic data contains % future batches.', v_future_count;
  end if;
  if v_preserved_reading_count < 12132 then
    raise exception 'Historical Jalan Ban readings were not preserved.';
  end if;
end;
$$;

commit;
