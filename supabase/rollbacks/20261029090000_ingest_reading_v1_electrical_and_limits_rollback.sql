-- Rollback for 20261029090000_ingest_reading_v1_electrical_and_limits.sql
-- Restores the 24 Oct ingest_reading_v1 (single reading, no current/voltage, wider limits).
-- Remove current_a / voltage_v from API clients first: the old version rejects them.
begin;
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
    if v_key not in ('test_point_id', 'reading_ts', 'value_mv', 'temperature_c', 'medium_conductivity', 'ph', 'dissolved_oxygen') then
      raise exception 'Unexpected field' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_reading->'test_point_id') is distinct from 'string'
     or (p_reading->>'test_point_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_reading->'reading_ts') is distinct from 'string'
     or length(p_reading->>'reading_ts') > 35
     or (p_reading->>'reading_ts') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-](0\d|1[0-4]):[0-5]\d)$'
     or jsonb_typeof(p_reading->'value_mv') is distinct from 'number' then
    raise exception 'Invalid required fields' using errcode = '22023';
  end if;
  v_value := (p_reading->>'value_mv')::numeric;
  if v_value <> trunc(v_value) or v_value < -2147483648 or v_value > 2147483647 then
    raise exception 'Invalid potential' using errcode = '22023';
  end if;
  v_ts := (p_reading->>'reading_ts')::timestamptz;
  foreach v_key in array array['temperature_c', 'medium_conductivity', 'ph', 'dissolved_oxygen'] loop
    if p_reading ? v_key and p_reading->v_key <> 'null'::jsonb then
      if jsonb_typeof(p_reading->v_key) <> 'number' then
        raise exception 'Invalid measurement' using errcode = '22023';
      end if;
      v_value := (p_reading->>v_key)::numeric;
      if v_value > (case when v_key = 'ph' then 14 else 1000000 end)
         or v_value < (case when v_key = 'temperature_c' then -273.15 else 0 end) then
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
  if (select count(*) from public.reading_batches
      where entered_by = v_user.id and created_at >= clock_timestamp() - interval '1 minute') >= 60 then
    raise exception 'Rate limited' using errcode = 'P0429';
  end if;
  v_id := public.create_manual_reading(
    v_point.id, v_ts, (p_reading->>'value_mv')::numeric::integer,
    (p_reading->>'temperature_c')::numeric, (p_reading->>'medium_conductivity')::numeric,
    (p_reading->>'ph')::numeric, (p_reading->>'dissolved_oxygen')::numeric, null::numeric);
  -- Same underlying classification/aggregation functions as existing manual/import data.
  perform public.refresh_daily_summary(v_point.id, (v_ts at time zone 'Asia/Singapore')::date, 'Asia/Singapore');
  perform public.refresh_weekly_summary(v_point.id, public.summary_week_start((v_ts at time zone 'Asia/Singapore')::date), 5);
  return v_id;
end;
$$;
revoke all on function public.ingest_reading_v1(jsonb) from public, anon;
grant execute on function public.ingest_reading_v1(jsonb) to authenticated;
commit;
