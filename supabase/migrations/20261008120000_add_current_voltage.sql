-- 20261008120000_add_current_voltage.sql  (#134)
-- PREPARED, NOT APPLIED. Alex applies after review. Run AFTER the #133 migration:
-- #133 changes grants/search_path on the OLD function signatures dropped below.
--
-- Rectifier output current (A) and voltage (V) per reading batch; power (W) is
-- calculated automatically. Placement (reading_batches) and ranges are provisional
-- (D-MEAS-1): the client email of 8 Oct says "rectifier outputs" and "calculate
-- power automatically" but does not state placement or limits.
begin;

alter table public.reading_batches
  add column current_a numeric(8,3),
  add column voltage_v numeric(8,3),
  add constraint reading_batches_current_a_range
    check (current_a is null or (current_a >= 0 and current_a <= 300)),
  add constraint reading_batches_voltage_v_range
    check (voltage_v is null or (voltage_v >= 0 and voltage_v <= 200));

comment on column public.reading_batches.current_a is
  'Rectifier output current in amperes (A). Provisional: placement and 0-300 range pending client confirmation (D-MEAS-1).';
comment on column public.reading_batches.voltage_v is
  'Rectifier output voltage in volts (V). Provisional: placement and 0-200 range pending client confirmation (D-MEAS-1).';
comment on column public.reading_batches.power_watts is
  'Power in watts (W). Calculated as current_a * voltage_v by trigger when both are present; otherwise a legacy/entered value.';

-- Power is calculated automatically whenever current and voltage are both present.
create function public.reading_batches_calculate_power()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.current_a is not null and new.voltage_v is not null then
    new.power_watts := round(new.current_a * new.voltage_v, 5);
  elsif tg_op = 'UPDATE'
        and old.current_a is not null and old.voltage_v is not null
        and new.power_watts is not distinct from old.power_watts then
    new.power_watts := null;   -- a calculated value that lost its inputs must not linger
  end if;
  return new;
end
$$;

revoke all on function public.reading_batches_calculate_power() from public, anon, authenticated;

create trigger reading_batches_calculate_power
  before insert or update of current_a, voltage_v, power_watts on public.reading_batches
  for each row execute function public.reading_batches_calculate_power();

-- New columns are appended at the end (required by create or replace view).
create or replace view public.v_readings with (security_invoker = true) as
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
  tpr.created_at,
  rb.current_a,
  rb.voltage_v
from public.test_point_readings tpr
join public.reading_batches rb on rb.id = tpr.batch_id
join public.test_points tp on tp.id = tpr.test_point_id
left join public.locations l on l.id = rb.location_id;

-- create_manual_reading: old 8-argument signature dropped (a second overload would
-- make PostgREST calls ambiguous); new one adds p_current_a / p_voltage_v.
drop function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric);

create function public.create_manual_reading(
  p_test_point_id uuid,
  p_reading_ts timestamptz,
  p_value_mv integer,
  p_temperature_c numeric default null,
  p_medium_conductivity numeric default null,
  p_ph numeric default null,
  p_dissolved_oxygen numeric default null,
  p_power_watts numeric default null,
  p_current_a numeric default null,
  p_voltage_v numeric default null
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
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  -- Duplicate guard: any reading for this test point within +/- 1 minute.
  if public.check_recent_reading_exists(p_test_point_id, p_reading_ts, 1) then
    raise exception 'A reading for this test point was already recorded within the last minute. Please check the Data History before adding another.'
      using errcode = 'unique_violation';
  end if;

  select location_id, threshold_mv
  into   v_location_id, v_threshold_mv
  from   public.test_points
  where  id = p_test_point_id;

  if v_location_id is null then
    raise exception 'Test point % not found', p_test_point_id;
  end if;

  insert into public.reading_batches (
    location_id, reading_ts, entered_by, upload_method,
    temperature_c, medium_conductivity, ph, dissolved_oxygen,
    power_watts, current_a, voltage_v
  ) values (
    v_location_id, p_reading_ts, v_user_id, 'manual',
    p_temperature_c, p_medium_conductivity, p_ph, p_dissolved_oxygen,
    p_power_watts, p_current_a, p_voltage_v
  )
  returning id into v_batch_id;

  insert into public.test_point_readings (batch_id, test_point_id, value_mv, threshold_mv_snapshot)
  values (v_batch_id, p_test_point_id, p_value_mv, coalesce(v_threshold_mv, -850))
  returning id into v_reading_id;

  return v_reading_id;
end
$$;

revoke all on function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- update_manual_reading: same treatment, plus the p_batch_id argument the app already sends.
-- Stays revoked from everyone (#133 decision): the app uses RLS-guarded direct updates
-- until an edit-permission rule (own reading < 1 h, per the access matrix) is built in.
drop function public.update_manual_reading(uuid, uuid, timestamptz, integer, integer, numeric, numeric, numeric, numeric, numeric, integer);

create function public.update_manual_reading(
  p_reading_id uuid,
  p_batch_id uuid default null,
  p_test_point_id uuid default null,
  p_reading_ts timestamptz default null,
  p_value_mv integer default null,
  p_threshold_mv_snapshot integer default null,
  p_temperature_c numeric default null,
  p_medium_conductivity numeric default null,
  p_ph numeric default null,
  p_dissolved_oxygen numeric default null,
  p_power_watts numeric default null,
  p_current_a numeric default null,
  p_voltage_v numeric default null,
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
    tpr.id as reading_id,
    tpr.batch_id,
    tpr.test_point_id,
    tpr.value_mv,
    tpr.threshold_mv_snapshot,
    rb.reading_ts,
    rb.upload_method
  into v_old
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where tpr.id = p_reading_id
  for update;

  if v_old.reading_id is null then
    raise exception 'Reading was not found.';
  end if;

  if p_batch_id is not null and p_batch_id <> v_old.batch_id then
    raise exception 'Reading does not belong to the given batch.';
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
    power_watts = coalesce(p_power_watts, power_watts),
    current_a = coalesce(p_current_a, current_a),
    voltage_v = coalesce(p_voltage_v, voltage_v)
  where id = v_old.batch_id;

  select
    tpr.id as reading_id,
    tpr.batch_id,
    tpr.test_point_id,
    tpr.value_mv,
    rb.reading_ts
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

revoke all on function public.update_manual_reading(uuid, uuid, uuid, timestamptz, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer) from public, anon, authenticated;

commit;
