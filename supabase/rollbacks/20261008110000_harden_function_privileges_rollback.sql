-- Rollback for 20261008110000_harden_function_privileges.sql (#133).
-- Restores the exported state of 2 Oct 2026: functions executable by anon again.
-- That state is the vulnerability being fixed: use only to recover from a broken release.
-- If #134 was applied after #133, roll #134 back first.
begin;

alter default privileges in schema public grant execute on functions to public, anon;

-- Maintenance functions: back to executable by everyone.
grant execute on function public.backfill_daily_and_weekly_summaries(date, date, text, integer) to public, anon, authenticated;
grant execute on function public.process_summary_refresh_queue(integer, integer) to public, anon, authenticated;
grant execute on function public.queue_summary_refresh(uuid, date) to public, anon, authenticated;
grant execute on function public.queue_summary_refresh_for_batch_timestamp_change() to public, anon, authenticated;
grant execute on function public.queue_summary_refresh_for_reading_change() to public, anon, authenticated;
grant execute on function public.refresh_daily_summary(uuid, date, text) to public, anon, authenticated;
grant execute on function public.refresh_weekly_summary(uuid, date, integer) to public, anon, authenticated;
grant execute on function public.rls_auto_enable() to public, anon, authenticated;
grant execute on function public.set_test_point_positions_updated_at() to public, anon, authenticated;

-- Functions that were anon-executable before.
grant execute on function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric) to public, anon, authenticated;
grant execute on function public.check_recent_reading_exists(uuid, timestamptz, integer) to public, anon, authenticated;
grant execute on function public.compare_weekly_summaries(date, date, integer) to public, anon, authenticated;
grant execute on function public.get_test_point_daily_summaries(date, text, uuid[]) to public, anon, authenticated;
grant execute on function public.get_test_point_daily_summaries(date, text) to public, anon, authenticated;
grant execute on function public.get_test_point_weekly_summaries(date, text, integer) to public, anon, authenticated;
grant execute on function public.get_test_point_weekly_summaries(date, text, integer, uuid[]) to public, anon, authenticated;
grant execute on function public.get_weekly_summary_available_weeks(text, integer) to public, anon, authenticated;
grant execute on function public.is_admin() to public, anon, authenticated;
grant execute on function public.current_user_is_admin() to public, anon, authenticated;
grant execute on function public.current_user_is_active() to public, anon, authenticated;
grant execute on function public.summary_is_engineer_or_admin() to public, anon, authenticated;
grant execute on function public.summary_week_start(date) to public, anon, authenticated;

-- These three were authenticated-only before; the grant to authenticated stays.
-- update_manual_reading stays revoked from everyone (as exported).

-- search_path back to unset where there was none.
alter function public.current_user_is_admin() reset search_path;
alter function public.current_user_is_active() reset search_path;
alter function public.check_recent_reading_exists(uuid, timestamptz, integer) reset search_path;
alter function public.summary_week_start(date) reset search_path;
alter function public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric) reset search_path;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy "Users read own profile" on public.users;
create policy "Users read own profile"
  on public.users for select
  to public
  using (id = auth.uid());

drop policy "Admins read backup reading batches" on public.backup_jalanban_reading_batches;
drop policy "Admins read backup test point readings" on public.backup_jalanban_test_point_readings;
drop policy "Admins read readings view backup" on public.v_readings_backup_table;

commit;
