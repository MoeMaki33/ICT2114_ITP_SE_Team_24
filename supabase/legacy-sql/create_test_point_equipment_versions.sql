-- Equipment replacement / upgrade tracking for logical test points.
-- A test point remains stable; this table records the equipment/version active over time.

create extension if not exists pgcrypto;

create table if not exists public.test_point_equipment_versions (
  id uuid primary key default gen_random_uuid(),
  test_point_id uuid not null references public.test_points(id) on delete cascade,
  version_no integer not null,
  installed_at timestamptz not null,
  removed_at timestamptz,
  change_type text not null default 'replacement'
    check (change_type in ('initial_install', 'replacement', 'upgrade', 'repair', 'calibration')),
  reason text,
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (test_point_id, version_no),
  check (removed_at is null or removed_at >= installed_at)
);

alter table public.test_point_equipment_versions
drop column if exists equipment_serial,
drop column if exists equipment_model,
drop column if exists equipment_type;

alter table public.test_points
add column if not exists current_equipment_version_id uuid
references public.test_point_equipment_versions(id);

create index if not exists idx_equipment_versions_test_point
on public.test_point_equipment_versions(test_point_id, installed_at desc);

create index if not exists idx_equipment_versions_active
on public.test_point_equipment_versions(test_point_id)
where removed_at is null;

alter table public.test_point_equipment_versions enable row level security;

drop policy if exists "Active users can read test point equipment versions"
on public.test_point_equipment_versions;

drop policy if exists "Admins can insert test point equipment versions"
on public.test_point_equipment_versions;

drop policy if exists "Admins can update test point equipment versions"
on public.test_point_equipment_versions;

drop policy if exists "Admins can delete test point equipment versions"
on public.test_point_equipment_versions;

create policy "Active users can read test point equipment versions"
on public.test_point_equipment_versions for select to authenticated
using (public.current_user_is_active());

create policy "Admins can insert test point equipment versions"
on public.test_point_equipment_versions for insert to authenticated
with check (public.current_user_is_admin());

create policy "Admins can update test point equipment versions"
on public.test_point_equipment_versions for update to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy "Admins can delete test point equipment versions"
on public.test_point_equipment_versions for delete to authenticated
using (public.current_user_is_admin());

grant select, insert, update, delete on public.test_point_equipment_versions to authenticated;
grant select, insert, update, delete on public.test_point_equipment_versions to service_role;
