-- Test Point-level coordinates for Asset Map.
-- This table is intentionally flexible while final asset/pipeline modelling is pending.

create table if not exists public.test_point_positions (
  id uuid primary key default gen_random_uuid(),

  test_point_id uuid not null
    references public.test_points(id)
    on delete cascade,

  coordinate_mode text not null default 'unmapped'
    check (
      coordinate_mode in (
        'gps',
        'relative',
        'gps_and_relative',
        'unmapped'
      )
    ),

  latitude numeric,
  longitude numeric,

  relative_x_m numeric,
  relative_y_m numeric,
  relative_z_m numeric,

  chainage_m numeric,

  coordinate_accuracy_m numeric,
  coordinate_source text,

  is_current boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  constraint test_point_positions_latitude_range
    check (latitude is null or latitude between -90 and 90),

  constraint test_point_positions_longitude_range
    check (longitude is null or longitude between -180 and 180),

  constraint test_point_positions_gps_modes_require_lat_lng
    check (
      coordinate_mode not in ('gps', 'gps_and_relative')
      or (latitude is not null and longitude is not null)
    ),

  constraint test_point_positions_relative_modes_require_xy
    check (
      coordinate_mode not in ('relative', 'gps_and_relative')
      or (relative_x_m is not null and relative_y_m is not null)
    )
);

create unique index if not exists test_point_positions_one_current_position
on public.test_point_positions(test_point_id)
where is_current = true;

create index if not exists test_point_positions_test_point_id_idx
on public.test_point_positions(test_point_id);

create index if not exists test_point_positions_coordinate_mode_idx
on public.test_point_positions(coordinate_mode)
where is_current = true;

create or replace function public.set_test_point_positions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_test_point_positions_updated_at
on public.test_point_positions;

create trigger trg_test_point_positions_updated_at
before update on public.test_point_positions
for each row
execute function public.set_test_point_positions_updated_at();
