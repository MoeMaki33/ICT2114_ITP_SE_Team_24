-- RLS for Test Point positions.
-- Authenticated app users can read current positions; only admins can manage them.

alter table public.test_point_positions enable row level security;

drop policy if exists "Engineers and admins can read current test point positions"
on public.test_point_positions;

drop policy if exists "Admins can insert test point positions"
on public.test_point_positions;

drop policy if exists "Admins can update test point positions"
on public.test_point_positions;

drop policy if exists "Admins can delete test point positions"
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
      and u.role in ('admin', 'corrosion_engineer')
  )
);

create policy "Admins can insert test point positions"
on public.test_point_positions for insert to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and u.role = 'admin'
  )
);

create policy "Admins can update test point positions"
on public.test_point_positions for update to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and u.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and u.role = 'admin'
  )
);

create policy "Admins can delete test point positions"
on public.test_point_positions for delete to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and u.role = 'admin'
  )
);

grant select, insert, update, delete on public.test_point_positions to authenticated;
