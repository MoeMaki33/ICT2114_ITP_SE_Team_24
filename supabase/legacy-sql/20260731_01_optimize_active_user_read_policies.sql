-- Evaluate the signed-in user's active status once per statement.
--
-- get_asset_map_points() reads the latest measurement for each active Test Point.
-- Calling current_user_is_active() once for every candidate reading caused the
-- Corrosion Engineer query path to exceed PostgREST's statement timeout. Wrapping
-- the stable, row-independent function in SELECT gives PostgreSQL an initPlan
-- that is cached for the duration of the statement.
--
-- This is a performance-only RLS change. The authenticated role requirement and
-- the active-user authorization rule remain unchanged.

alter policy "Active users can read locations"
on public.locations
using ((select public.current_user_is_active()));

alter policy "Active users can read reading batches"
on public.reading_batches
using ((select public.current_user_is_active()));

alter policy "Active users can read test point readings"
on public.test_point_readings
using ((select public.current_user_is_active()));

alter policy "Active users can read test points"
on public.test_points
using ((select public.current_user_is_active()));
