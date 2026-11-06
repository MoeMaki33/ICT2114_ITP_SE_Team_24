-- 20261029090000_ingest_reading_v1_electrical_and_limits.sql  (Readings API go-live)
-- PREPARED, NOT APPLIED. Apply on staging first; see docs/week9/readings-api.md.
-- Requires 20261008120000_add_current_voltage.sql (#134): checked below.
-- Rollback: supabase/rollbacks/20261029090000_ingest_reading_v1_electrical_and_limits_rollback.sql
--
-- Replaces ingest_reading_v1 (same signature, grants kept):
--   * accepts current_a / voltage_v (rectifier outputs, D-MEAS-1) on VARIABLE test
--     points only; power is calculated by the #134 trigger and is never accepted;
--   * rejects readings nobody reviews that the Excel import would only warn about:
--     timestamps more than 5 minutes ahead or before 2000, and values outside the
--     PROVISIONAL plausibility ranges below (keep equal to APP_SETTINGS['ingestion']
--     in www/php/app-settings.php);
--   * time-zone offsets limited to -14:00..+14:00.
begin;

do $$
begin
  if to_regprocedure('public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric)') is null then
    raise exception 'Apply 20261008120000_add_current_voltage.sql (#134) before this migration';
  end if;
end
$$;

create or replace function public.ingest_reading_v1(p_reading jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_point public.test_points%rowtype;
  v_ts timestamptz;
  v_id uuid;
  v_key text;
  v_value numeric;
  v_min numeric;
  v_max numeric;
begin
  if auth.uid() is null then
    raise exception 'Denied' using errcode = '42501';
  end if;
  -- Serializes this account's requests, including rate accounting.
  select * into v_user from public.users where id = auth.uid() for update;
  if v_user.id is null or v_user.is_active is distinct from true
     or v_user.role is null or v_user.role not in ('admin', 'corrosion_engineer') then
    raise exception 'Denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_reading) is distinct from 'object' then
    raise exception 'Invalid object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_reading) loop
    if v_key not in ('test_point_id', 'reading_ts', 'value_mv', 'temperature_c', 'medium_conductivity',
                     'ph', 'dissolved_oxygen', 'current_a', 'voltage_v') then
      raise exception 'Unexpected field' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_reading->'test_point_id') is distinct from 'string'
     or (p_reading->>'test_point_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_reading->'reading_ts') is distinct from 'string'
     or length(p_reading->>'reading_ts') > 35
     or (p_reading->>'reading_ts') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]((0\d|1[0-3]):[0-5]\d|14:00))$'
     or jsonb_typeof(p_reading->'value_mv') is distinct from 'number' then
    raise exception 'Invalid required fields' using errcode = '22023';
  end if;
  v_value := (p_reading->>'value_mv')::numeric;
  if v_value <> trunc(v_value) or v_value < -5000 or v_value > 5000 then
    raise exception 'Invalid potential' using errcode = '22023';
  end if;
  v_ts := (p_reading->>'reading_ts')::timestamptz;
  if v_ts > clock_timestamp() + interval '5 minutes' or v_ts < timestamptz '2000-01-01 00:00:00+00' then
    raise exception 'Invalid reading time' using errcode = '22023';
  end if;
  foreach v_key in array array['temperature_c', 'medium_conductivity', 'ph', 'dissolved_oxygen', 'current_a', 'voltage_v'] loop
    if p_reading ? v_key and p_reading->v_key <> 'null'::jsonb then
      if jsonb_typeof(p_reading->v_key) <> 'number' then
        raise exception 'Invalid measurement' using errcode = '22023';
      end if;
      v_value := (p_reading->>v_key)::numeric;
      select r.lo, r.hi into v_min, v_max
      from (values ('temperature_c', -50::numeric, 150::numeric),
                   ('medium_conductivity', 0, 1000000),
                   ('ph', 0, 14),
                   ('dissolved_oxygen', 0, 25),
                   ('current_a', 0, 300),
                   ('voltage_v', 0, 200)) as r(k, lo, hi)
      where r.k = v_key;
      if v_value < v_min or v_value > v_max then
        raise exception 'Invalid measurement' using errcode = '22023';
      end if;
    end if;
  end loop;
  -- Lock the point so duplicate checks among API writers cannot race.
  select * into v_point from public.test_points
    where id = (p_reading->>'test_point_id')::uuid for update;
  if v_point.id is null or v_point.is_active is distinct from true
     or (v_user.role <> 'admin' and v_point.assigned_engineer_id is distinct from v_user.id) then
    raise exception 'Denied' using errcode = '42501';
  end if;
  -- Rectifier outputs only exist on impressed-current (variable) points.
  if v_point.type::text is distinct from 'variable'
     and ((p_reading ? 'current_a' and p_reading->'current_a' <> 'null'::jsonb)
          or (p_reading ? 'voltage_v' and p_reading->'voltage_v' <> 'null'::jsonb)) then
    raise exception 'Current/voltage only apply to variable test points' using errcode = '22023';
  end if;
  if (select count(*) from public.reading_batches
      where entered_by = v_user.id and created_at >= clock_timestamp() - interval '1 minute') >= 60 then
    raise exception 'Rate limited' using errcode = 'P0429';
  end if;
  v_id := public.create_manual_reading(
    v_point.id, v_ts, (p_reading->>'value_mv')::numeric::integer,
    (p_reading->>'temperature_c')::numeric, (p_reading->>'medium_conductivity')::numeric,
    (p_reading->>'ph')::numeric, (p_reading->>'dissolved_oxygen')::numeric,
    null::numeric,                                   -- power: calculated from V x I by trigger
    (p_reading->>'current_a')::numeric, (p_reading->>'voltage_v')::numeric);
  -- Same underlying classification/aggregation functions as existing manual/import data.
  perform public.refresh_daily_summary(v_point.id, (v_ts at time zone 'Asia/Singapore')::date, 'Asia/Singapore');
  perform public.refresh_weekly_summary(v_point.id, public.summary_week_start((v_ts at time zone 'Asia/Singapore')::date), 5);
  return v_id;
end;
$$;

revoke all on function public.ingest_reading_v1(jsonb) from public, anon;
grant execute on function public.ingest_reading_v1(jsonb) to authenticated;

commit;
