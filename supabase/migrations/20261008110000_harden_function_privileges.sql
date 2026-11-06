-- 20261008110000_harden_function_privileges.sql  (#133)
-- PREPARED, NOT APPLIED. Alex applies after review and after the #135 baseline.
-- Run BEFORE 20261008120000_add_current_voltage.sql (#134), which drops and
-- recreates create_manual_reading / update_manual_reading.
--
-- Based on the live export of 2 Oct 2026 (function list, grants, policies).
-- Today every function is executable by anon, including SECURITY DEFINER ones,
-- so an unauthenticated caller could reach definer functions through the API.
begin;

-- 1. New functions in public are no longer executable by PUBLIC / anon by default.
--    Grant authenticated/service_role explicitly per function.
alter default privileges in schema public revoke execute on functions from public, anon;

-- 2. Maintenance / trigger / internal functions: nobody calls them through the API.
--    pg_cron runs as postgres; triggers do not need EXECUTE for the caller;
--    definer functions that call them run as their owner. service_role is unchanged.
revoke all on function public.backfill_daily_and_weekly_summaries(date, date, text, integer) from public, anon, authenticated;
revoke all on function public.process_summary_refresh_queue(integer, integer) from public, anon, authenticated;
revoke all on function public.queue_summary_refresh(uuid, date) from public, anon, authenticated;
revoke all on function public.queue_summary_refresh_for_batch_timestamp_change() from public, anon, authenticated;
revoke all on function public.queue_summary_refresh_for_reading_change() from public, anon, authenticated;
revoke all on function public.refresh_daily_summary(uuid, date, text) from public, anon, authenticated;
revoke all on function public.refresh_weekly_summary(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.set_test_point_positions_updated_at() from public, anon, authenticated;

-- 3. update_manual_reading: not called successfully by the app today (the app sends a
--    p_batch_id argument the function does not have, so edits use RLS-guarded direct
--    updates). Stays revoked from everyone until an edit-permission rule is built in
--    (rewritten in #134).
revoke all on function public.update_manual_reading(uuid, uuid, timestamptz, integer, integer, numeric, numeric, numeric, numeric, numeric, integer) from public, anon, authenticated;

-- 4. Application RPCs and RLS helper functions: signed-in users only.
--    (RLS policies call the helpers as the caller, so authenticated needs EXECUTE.)
revoke all on function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric) from public, anon;
revoke all on function public.check_recent_reading_exists(uuid, timestamptz, integer) from public, anon;
revoke all on function public.compare_weekly_summaries(date, date, integer) from public, anon;
revoke all on function public.get_asset_map_points() from public, anon;
revoke all on function public.get_test_point_daily_summaries(date, text, uuid[]) from public, anon;
revoke all on function public.get_test_point_daily_summaries(date, text) from public, anon;
revoke all on function public.get_test_point_weekly_summaries(date, text, integer) from public, anon;
revoke all on function public.get_test_point_weekly_summaries(date, text, integer, uuid[]) from public, anon;
revoke all on function public.get_weekly_summary_available_weeks(text, integer) from public, anon;
revoke all on function public.get_test_point_position_history(uuid) from public, anon;
revoke all on function public.set_test_point_position(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.current_user_is_admin() from public, anon;
revoke all on function public.current_user_is_active() from public, anon;
revoke all on function public.summary_is_engineer_or_admin() from public, anon;
revoke all on function public.summary_week_start(date) from public, anon;

grant execute on function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.check_recent_reading_exists(uuid, timestamptz, integer) to authenticated;
grant execute on function public.compare_weekly_summaries(date, date, integer) to authenticated;
grant execute on function public.get_asset_map_points() to authenticated;
grant execute on function public.get_test_point_daily_summaries(date, text, uuid[]) to authenticated;
grant execute on function public.get_test_point_daily_summaries(date, text) to authenticated;
grant execute on function public.get_test_point_weekly_summaries(date, text, integer) to authenticated;
grant execute on function public.get_test_point_weekly_summaries(date, text, integer, uuid[]) to authenticated;
grant execute on function public.get_weekly_summary_available_weeks(text, integer) to authenticated;
grant execute on function public.get_test_point_position_history(uuid) to authenticated;
grant execute on function public.set_test_point_position(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.summary_is_engineer_or_admin() to authenticated;
grant execute on function public.summary_week_start(date) to authenticated;

-- 5. Fixed search_path on functions that had none. All references in these bodies are
--    schema-qualified (public.*, auth.uid()), so an empty search_path is safe.
--    create_manual_reading calls check_recent_reading_exists unqualified, so it gets
--    public, pg_temp (#134 recreates it with search_path = public).
alter function public.current_user_is_admin() set search_path = '';
alter function public.current_user_is_active() set search_path = '';
alter function public.check_recent_reading_exists(uuid, timestamptz, integer) set search_path = '';
alter function public.summary_week_start(date) set search_path = '';
alter function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric) set search_path = public, pg_temp;

-- 6. is_admin() must also require an active account (current_user_is_admin() already does).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

-- 7. "Users read own profile" applied to role public (includes anon); signed-in users only.
drop policy "Users read own profile" on public.users;
create policy "Users read own profile"
  on public.users for select
  to authenticated
  using (id = (select auth.uid()));

-- 7b. RLS is on for the backup tables but they have no policy. Make the intent explicit:
--     admin read only. Alex decides whether to drop these tables (not done here).
create policy "Admins read backup reading batches"
  on public.backup_jalanban_reading_batches for select
  to authenticated
  using ((select public.current_user_is_admin()));
create policy "Admins read backup test point readings"
  on public.backup_jalanban_test_point_readings for select
  to authenticated
  using ((select public.current_user_is_admin()));
create policy "Admins read readings view backup"
  on public.v_readings_backup_table for select
  to authenticated
  using ((select public.current_user_is_admin()));

commit;
