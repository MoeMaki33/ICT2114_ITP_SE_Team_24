-- Rollback for 20261008120000_add_current_voltage.sql (#134).
-- WARNING: dropping current_a / voltage_v DELETES any current and voltage values
-- entered since the migration. Export them first if they matter.
-- Power values already calculated stay in power_watts.
-- Re-check grants against the #135 baseline before running: the view and function
-- grants below mirror the pre-#134 state as exported on 2 Oct 2026 and the #133 decisions.
begin;

drop trigger if exists reading_batches_calculate_power on public.reading_batches;
drop function if exists public.reading_batches_calculate_power();

-- A view cannot lose columns via create or replace, so drop and recreate it.
drop view public.v_readings;
create view public.v_readings with (security_invoker = true) as
select
  tpr.id,
  tpr.batch_id,
  tpr.test_point_id,
  tp.label as test_point_label,
  rb.location_id,
  l.site_name,
  tpr.value_mv,
  tpr.threshold_mv_snapshot,
  tpr.is_protected,
  rb.reading_ts,
  rb.upload_method,
  rb.temperature_c,
  rb.medium_conductivity,
  rb.ph,
  rb.dissolved_oxygen,
  rb.power_watts,
  rb.source_file,
  rb.entered_by,
  tpr.created_at
from public.test_point_readings tpr
join public.reading_batches rb on rb.id = tpr.batch_id
join public.test_points tp on tp.id = tpr.test_point_id
left join public.locations l on l.id = rb.location_id;

grant select on public.v_readings to authenticated, service_role;

drop function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric);
drop function public.update_manual_reading(uuid, uuid, uuid, timestamptz, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer);

create function public.create_manual_reading(
  p_test_point_id uuid,
  p_reading_ts timestamptz,
  p_value_mv integer,
  p_temperature_c numeric default null,
  p_medium_conductivity numeric default null,
  p_ph numeric default null,
  p_dissolved_oxygen numeric default null,
  p_power_watts numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id  uuid;
  v_threshold_mv integer;
  v_batch_id     uuid;
  v_reading_id   uuid;
  v_user_id      uuid := auth.uid();
begin
  if public.check_recent_reading_exists(p_test_point_id, p_reading_ts, 1) then
    raise exception 'A reading for this test point was already recorded within the last minute. Please check the Data History before adding another.'
      using errcode = 'unique_violation';
  end if;

  select location_id, threshold_mv into v_location_id, v_threshold_mv
  from public.test_points where id = p_test_point_id;

  if v_location_id is null then
    raise exception 'Test point % not found', p_test_point_id;
  end if;

  insert into public.reading_batches (
    location_id, reading_ts, entered_by, upload_method,
    temperature_c, medium_conductivity, ph, dissolved_oxygen, power_watts
  ) values (
    v_location_id, p_reading_ts, v_user_id, 'manual',
    p_temperature_c, p_medium_conductivity, p_ph, p_dissolved_oxygen, p_power_watts
  )
  returning id into v_batch_id;

  insert into public.test_point_readings (batch_id, test_point_id, value_mv, threshold_mv_snapshot)
  values (v_batch_id, p_test_point_id, p_value_mv, coalesce(v_threshold_mv, -850))
  returning id into v_reading_id;

  return v_reading_id;
end
$$;

revoke all on function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric) to authenticated;

create function public.update_manual_reading(
  p_reading_id uuid,
  p_test_point_id uuid default null,
  p_reading_ts timestamptz default null,
  p_value_mv integer default null,
  p_threshold_mv_snapshot integer default null,
  p_temperature_c numeric default null,
  p_medium_conductivity numeric default null,
  p_ph numeric default null,
  p_dissolved_oxygen numeric default null,
  p_power_watts numeric default null,
  p_stable_tolerance_mv integer default 5
)
returns table (
  reading_id uuid,
  batch_id uuid,
  test_point_id uuid,
  value_mv integer,
  reading_ts timestamptz,
  old_summary_date date,
  new_summary_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_old      record;
  v_new      record;
  v_old_date date;
  v_new_date date;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select
    tpr.id as reading_id, tpr.batch_id, tpr.test_point_id, tpr.value_mv,
    tpr.threshold_mv_snapshot, rb.reading_ts, rb.upload_method
  into v_old
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where tpr.id = p_reading_id
  for update;

  if v_old.reading_id is null then
    raise exception 'Reading was not found.';
  end if;

  if v_old.upload_method <> 'manual' then
    raise exception 'Only manual readings can be edited with update_manual_reading.';
  end if;

  v_old_date := (v_old.reading_ts at time zone 'Asia/Singapore')::date;

  update public.test_point_readings
  set
    test_point_id = coalesce(p_test_point_id, test_point_id),
    value_mv = coalesce(p_value_mv, value_mv),
    threshold_mv_snapshot = coalesce(p_threshold_mv_snapshot, threshold_mv_snapshot)
  where id = p_reading_id;

  update public.reading_batches
  set
    reading_ts = coalesce(p_reading_ts, reading_ts),
    temperature_c = coalesce(p_temperature_c, temperature_c),
    medium_conductivity = coalesce(p_medium_conductivity, medium_conductivity),
    ph = coalesce(p_ph, ph),
    dissolved_oxygen = coalesce(p_dissolved_oxygen, dissolved_oxygen),
    power_watts = coalesce(p_power_watts, power_watts)
  where id = v_old.batch_id;

  select tpr.id as reading_id, tpr.batch_id, tpr.test_point_id, tpr.value_mv, rb.reading_ts
  into v_new
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where tpr.id = p_reading_id;

  v_new_date := (v_new.reading_ts at time zone 'Asia/Singapore')::date;

  perform public.refresh_daily_summary(v_old.test_point_id, v_old_date);
  perform public.refresh_weekly_summary(v_old.test_point_id, public.summary_week_start(v_old_date), p_stable_tolerance_mv);

  if v_new.test_point_id is distinct from v_old.test_point_id
    or v_new_date is distinct from v_old_date then
    perform public.refresh_daily_summary(v_new.test_point_id, v_new_date);
    perform public.refresh_weekly_summary(v_new.test_point_id, public.summary_week_start(v_new_date), p_stable_tolerance_mv);
  end if;

  reading_id := v_new.reading_id;
  batch_id := v_new.batch_id;
  test_point_id := v_new.test_point_id;
  value_mv := v_new.value_mv;
  reading_ts := v_new.reading_ts;
  old_summary_date := v_old_date;
  new_summary_date := v_new_date;
  return next;
end
$$;

revoke all on function public.update_manual_reading(uuid, uuid, timestamptz, integer, integer, numeric, numeric, numeric, numeric, numeric, integer) from public, anon, authenticated;

alter table public.reading_batches
  drop constraint reading_batches_current_a_range,
  drop constraint reading_batches_voltage_v_range,
  drop column current_a,
  drop column voltage_v;

comment on column public.reading_batches.power_watts is null;

commit;
