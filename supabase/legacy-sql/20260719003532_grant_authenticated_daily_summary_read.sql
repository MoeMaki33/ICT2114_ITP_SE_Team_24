-- The three-argument get_test_point_daily_summaries RPC is SECURITY INVOKER
-- and reads public.daily_summaries. RLS already restricts rows to active
-- corrosion engineers and admins, but PostgreSQL evaluates table privileges
-- before that policy and authenticated currently lacks SELECT.
grant select on table public.daily_summaries to authenticated;
