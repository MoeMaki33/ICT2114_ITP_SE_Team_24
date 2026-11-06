-- Corrective Sprint 5 migration.
-- Keeps earlier shared migrations intact while aligning position history,
-- controlled writes, and the compact Asset Map contract.

alter table public.test_point_positions
  add column if not exists valid_from timestamptz,
  add column if not exists valid_to timestamptz;

update public.test_point_positions
set valid_from = coalesce(valid_from, created_at, now())
where valid_from is null;

alter table public.test_point_positions
  alter column valid_from set default now(),
  alter column valid_from set not null;

update public.test_point_positions
set valid_to = coalesce(valid_to, updated_at, now())
where is_current = false
  and valid_to is null;

update public.test_point_positions
set valid_to = null
where is_current = true;

create unique index if not exists test_point_positions_one_current_position
  on public.test_point_positions(test_point_id)
  where is_current = true;

create index if not exists test_point_positions_history_lookup_idx
  on public.test_point_positions(test_point_id, valid_from desc);

alter table public.test_point_positions enable row level security;

drop policy if exists "Engineers and admins can read current test point positions"
  on public.test_point_positions;

create policy "Engineers and admins can read current test point positions"
on public.test_point_positions for select to authenticated
using (
  is_current = true
  and exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and lower(u.role::text) in ('admin', 'corrosion_engineer')
  )
);

grant select on public.test_point_positions to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'test_point_positions_validity_consistent'
      and conrelid = 'public.test_point_positions'::regclass
  ) then
    alter table public.test_point_positions
      add constraint test_point_positions_validity_consistent
      check (
        (is_current = true and valid_to is null)
        or (is_current = false and valid_to is not null and valid_to >= valid_from)
      ) not valid;
  end if;
end;
$$;

alter table public.test_point_positions
  validate constraint test_point_positions_validity_consistent;

-- Position history is read through the controlled history RPC. Direct table
-- reads intentionally expose only the current row under the existing RLS policy.
revoke insert, update, delete on public.test_point_positions from authenticated;

drop policy if exists "Admins can insert test point positions"
  on public.test_point_positions;
drop policy if exists "Admins can update test point positions"
  on public.test_point_positions;
drop policy if exists "Admins can delete test point positions"
  on public.test_point_positions;

create or replace function public.set_test_point_position(
  p_test_point_id uuid,
  p_coordinate_mode text,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_relative_x_m numeric default null,
  p_relative_y_m numeric default null,
  p_relative_z_m numeric default null,
  p_chainage_m numeric default null,
  p_coordinate_accuracy_m numeric default null,
  p_coordinate_source text default null
)
returns public.test_point_positions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_mode text := lower(trim(coalesce(p_coordinate_mode, '')));
  v_position public.test_point_positions;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = v_user_id
      and u.is_active = true
      and lower(u.role::text) = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Only an active Admin may manage Test Point positions.';
  end if;

  -- The row lock serialises concurrent moves for the same Test Point.
  perform 1
  from public.test_points tp
  where tp.id = p_test_point_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Test Point not found.';
  end if;

  if v_mode not in ('gps', 'relative', 'gps_and_relative', 'unmapped') then
    raise exception using errcode = '22023', message = 'Invalid coordinate mode.';
  end if;

  if v_mode in ('gps', 'gps_and_relative')
     and (p_latitude is null or p_longitude is null) then
    raise exception using errcode = '22023', message = 'Latitude and longitude are required for this coordinate mode.';
  end if;

  if v_mode in ('relative', 'gps_and_relative')
     and (p_relative_x_m is null or p_relative_y_m is null) then
    raise exception using errcode = '22023', message = 'Relative X and Relative Y are required for this coordinate mode.';
  end if;

  if p_latitude is not null and p_latitude not between -90 and 90 then
    raise exception using errcode = '22023', message = 'Latitude must be between -90 and 90.';
  end if;

  if p_longitude is not null and p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Longitude must be between -180 and 180.';
  end if;

  if p_coordinate_accuracy_m is not null and p_coordinate_accuracy_m < 0 then
    raise exception using errcode = '22023', message = 'Coordinate accuracy cannot be negative.';
  end if;

  update public.test_point_positions
  set is_current = false,
      valid_to = v_now,
      updated_at = v_now,
      updated_by = v_user_id
  where test_point_id = p_test_point_id
    and is_current = true;

  insert into public.test_point_positions (
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
    valid_from,
    valid_to,
    updated_by
  ) values (
    p_test_point_id,
    v_mode,
    case when v_mode in ('gps', 'gps_and_relative') then p_latitude else null end,
    case when v_mode in ('gps', 'gps_and_relative') then p_longitude else null end,
    case when v_mode in ('relative', 'gps_and_relative') then p_relative_x_m else null end,
    case when v_mode in ('relative', 'gps_and_relative') then p_relative_y_m else null end,
    case when v_mode in ('relative', 'gps_and_relative') then p_relative_z_m else null end,
    case when v_mode in ('relative', 'gps_and_relative') then p_chainage_m else null end,
    case when v_mode = 'unmapped' then null else p_coordinate_accuracy_m end,
    nullif(trim(coalesce(p_coordinate_source, '')), ''),
    true,
    v_now,
    null,
    v_user_id
  )
  returning * into v_position;

  return v_position;
end;
$$;

revoke all on function public.set_test_point_position(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) from public, anon;
grant execute on function public.set_test_point_position(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

create or replace function public.get_test_point_position_history(p_test_point_id uuid)
returns table (
  id uuid,
  test_point_id uuid,
  coordinate_mode text,
  latitude numeric,
  longitude numeric,
  relative_x_m numeric,
  relative_y_m numeric,
  relative_z_m numeric,
  chainage_m numeric,
  coordinate_accuracy_m numeric,
  coordinate_source text,
  is_current boolean,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = v_user_id
      and u.is_active = true
      and lower(u.role::text) in ('admin', 'corrosion_engineer')
  ) then
    raise exception using errcode = '42501', message = 'An active Admin or Corrosion Engineer account is required.';
  end if;

  return query
  select
    p.id,
    p.test_point_id,
    p.coordinate_mode,
    p.latitude,
    p.longitude,
    p.relative_x_m,
    p.relative_y_m,
    p.relative_z_m,
    p.chainage_m,
    p.coordinate_accuracy_m,
    p.coordinate_source,
    p.is_current,
    p.valid_from,
    p.valid_to,
    p.created_at,
    p.updated_at,
    p.updated_by
  from public.test_point_positions p
  where p.test_point_id = p_test_point_id
  order by p.valid_from desc, p.created_at desc;
end;
$$;

revoke all on function public.get_test_point_position_history(uuid) from public, anon;
grant execute on function public.get_test_point_position_history(uuid) to authenticated;

-- The output contract changed (position_id and two status dimensions), which
-- PostgreSQL cannot apply with CREATE OR REPLACE when a TABLE return type changes.
drop function if exists public.get_asset_map_points();

create function public.get_asset_map_points()
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
  position_id uuid,
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
  protection_status text,
  display_status text,
  assigned_engineer_id uuid,
  assigned_engineer_name text
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    tp.id,
    coalesce(nullif(tp.label, ''), tp.id::text),
    tp.label,
    tp.type,
    tp.threshold_mv::numeric,
    tp.location_id,
    l.site_name,
    l.latitude::numeric,
    l.longitude::numeric,
    tpp.id,
    coalesce(tpp.coordinate_mode, 'unmapped'),
    case when tpp.coordinate_mode in ('gps', 'gps_and_relative') then tpp.latitude end,
    case when tpp.coordinate_mode in ('gps', 'gps_and_relative') then tpp.longitude end,
    tpp.relative_x_m,
    tpp.relative_y_m,
    tpp.relative_z_m,
    tpp.chainage_m,
    tpp.coordinate_accuracy_m,
    tpp.coordinate_source,
    tpp.updated_at,
    latest.value_mv::numeric,
    latest.reading_ts,
    case
      when latest.value_mv is null then 'Unknown'
      when latest.value_mv <= coalesce(tp.threshold_mv, -850) then 'Protected'
      else 'Unprotected'
    end,
    case
      when latest.value_mv is null then 'Unknown'
      when latest.value_mv <= coalesce(tp.threshold_mv, -850) then 'Protected'
      when latest.value_mv <= -800 then 'Warning'
      else 'Unprotected'
    end,
    tp.assigned_engineer_id,
    u.full_name
  from public.test_points tp
  left join public.locations l on l.id = tp.location_id
  left join public.test_point_positions tpp
    on tpp.test_point_id = tp.id and tpp.is_current = true
  left join public.users u on u.id = tp.assigned_engineer_id
  left join lateral (
    select tpr.value_mv, rb.reading_ts
    from public.test_point_readings tpr
    join public.reading_batches rb on rb.id = tpr.batch_id
    where tpr.test_point_id = tp.id
    order by rb.reading_ts desc nulls last, tpr.created_at desc nulls last
    limit 1
  ) latest on true
  where tp.is_active = true
  order by coalesce(nullif(tp.label, ''), tp.id::text);
$$;

revoke all on function public.get_asset_map_points() from public, anon;
grant execute on function public.get_asset_map_points() to authenticated;

comment on function public.get_asset_map_points() is
  'Compact current-position and latest-reading dataset for Asset Map; location coordinates are site context only.';
