-- Rollback for 20261008100000_fix_protection_threshold.sql
-- Restores per-reading classification from the stored snapshot and removes the
-- fixed-threshold enforcement. Test point thresholds already set to -850 stay
-- -850 (the original custom values are not recoverable without a backup).
-- get_asset_map_points() keeps its fixed-threshold version; restore the
-- baseline definition (20261007065859_remote_schema.sql) if that is needed too.
begin;

drop trigger if exists zzzz_fixed_protection_threshold on public.test_point_readings;
drop trigger if exists zzzz_fixed_protection_threshold on public.test_points;
drop function if exists public.enforce_fixed_protection_threshold();

alter table public.test_points drop constraint if exists test_points_fixed_threshold;

alter table public.test_point_readings
  alter column is_protected set expression as (value_mv <= threshold_mv_snapshot);

commit;
