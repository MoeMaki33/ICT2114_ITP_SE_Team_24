-- Fixed -850 mV protection criterion (Owen, #145; client rule of 4 Jun).
-- Moved from supabase/legacy-sql/20261007000000_fix_protection_threshold.sql
-- so it runs after the baseline (20261007065859) and before #133.
-- Rewrites test_points.threshold_mv and test_point_readings.is_protected on
-- existing data: Alex takes a backup and runs it on staging before live.
-- Historical threshold snapshots are retained. Safe to re-run.
begin;

update public.test_points set threshold_mv = -850
where threshold_mv is distinct from -850;

alter table public.test_points alter column threshold_mv set default -850;
alter table public.test_points drop constraint if exists test_points_fixed_threshold;
alter table public.test_points add constraint test_points_fixed_threshold
  check (threshold_mv is not null and threshold_mv = -850);

create or replace function public.enforce_fixed_protection_threshold()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'test_points' then
    new.threshold_mv := -850;
  else
    if tg_op = 'INSERT' then
      new.threshold_mv_snapshot := -850;
    elsif new.value_mv is distinct from old.value_mv then
      new.threshold_mv_snapshot := -850;
    else
      -- Preserve existing audit snapshots on edits to other properties.
      new.threshold_mv_snapshot := old.threshold_mv_snapshot;
    end if;
    -- is_protected is a generated column (see below), so it is not set here.
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_fixed_protection_threshold() from public, anon, authenticated;

drop trigger if exists zzzz_fixed_protection_threshold on public.test_points;
create trigger zzzz_fixed_protection_threshold before insert or update
on public.test_points for each row execute function public.enforce_fixed_protection_threshold();

drop trigger if exists zzzz_fixed_protection_threshold on public.test_point_readings;
create trigger zzzz_fixed_protection_threshold before insert or update
on public.test_point_readings for each row execute function public.enforce_fixed_protection_threshold();

-- Fix current classification without rewriting historical audit thresholds.
-- is_protected is GENERATED ALWAYS AS (value_mv <= threshold_mv_snapshot) in the
-- baseline, so it can't be UPDATEd; change its expression instead (PostgreSQL 17).
-- This recomputes every row against the fixed -850 mV criterion and leaves
-- threshold_mv_snapshot untouched for audit.
alter table public.test_point_readings
  alter column is_protected set expression as (value_mv <= -850);

-- Asset-map function replacement follows below (same output contract).
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
set search_path = public, pg_temp
stable
as $$
  select
    tp.id,
    coalesce(nullif(tp.label, ''), tp.id::text),
    tp.label,
    tp.type,
    (-850)::numeric,
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
      when latest.value_mv <= -850 then 'Protected'
      else 'Unprotected'
    end,
    case
      when latest.value_mv is null then 'Unknown'
      when latest.value_mv <= -850 then 'Protected'
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

commit;
