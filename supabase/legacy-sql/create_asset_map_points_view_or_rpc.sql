-- Map-ready Asset Map RPC.
-- Returns one row per active Test Point without downloading historical readings.

alter table public.test_points
add column if not exists test_point_code text unique,
add column if not exists assigned_engineer_id uuid references public.users(id);

create or replace function public.get_asset_map_points()
returns table (
  test_point_id uuid,
  display_id text,
  label text,
  type text,
  threshold_mv numeric,
  location_id uuid,
  site_name text,
  location_latitude numeric,
  location_longitude numeric,

  coordinate_mode text,
  latitude numeric,
  longitude numeric,
  relative_x_m numeric,
  relative_y_m numeric,
  relative_z_m numeric,
  chainage_m numeric,
  coordinate_accuracy_m numeric,
  coordinate_source text,
  position_updated_at timestamptz,

  latest_reading_mv numeric,
  latest_reading_ts timestamptz,
  status text,
  assigned_engineer_id uuid,
  assigned_engineer_name text
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    tp.id as test_point_id,
    coalesce(nullif(tp.test_point_code, ''), nullif(tp.label, ''), tp.id::text) as display_id,
    tp.label,
    tp.type,
    tp.threshold_mv::numeric,
    tp.location_id,
    l.site_name,
    l.latitude as location_latitude,
    l.longitude as location_longitude,

    coalesce(tpp.coordinate_mode, 'unmapped') as coordinate_mode,
    case
      when tpp.coordinate_mode in ('gps', 'gps_and_relative') then tpp.latitude
      else null
    end as latitude,
    case
      when tpp.coordinate_mode in ('gps', 'gps_and_relative') then tpp.longitude
      else null
    end as longitude,
    tpp.relative_x_m,
    tpp.relative_y_m,
    tpp.relative_z_m,
    tpp.chainage_m,
    tpp.coordinate_accuracy_m,
    tpp.coordinate_source,
    tpp.updated_at as position_updated_at,

    latest.value_mv::numeric as latest_reading_mv,
    latest.reading_ts as latest_reading_ts,
    case
      when latest.value_mv is null then 'Unknown'
      when latest.value_mv <= coalesce(tp.threshold_mv, -850) then 'Protected'
      when latest.value_mv <= -800 then 'Warning'
      else 'Unprotected'
    end as status,
    tp.assigned_engineer_id,
    u.full_name as assigned_engineer_name
  from public.test_points tp
  left join public.locations l
    on l.id = tp.location_id
  left join public.test_point_positions tpp
    on tpp.test_point_id = tp.id
   and tpp.is_current = true
  left join public.users u
    on u.id = tp.assigned_engineer_id
  left join lateral (
    select
      tpr.value_mv,
      rb.reading_ts
    from public.test_point_readings tpr
    join public.reading_batches rb
      on rb.id = tpr.batch_id
    where tpr.test_point_id = tp.id
    order by rb.reading_ts desc nulls last, tpr.created_at desc nulls last
    limit 1
  ) latest on true
  where tp.is_active = true
  order by coalesce(nullif(tp.test_point_code, ''), nullif(tp.label, ''), tp.id::text);
$$;

grant execute on function public.get_asset_map_points() to authenticated;
