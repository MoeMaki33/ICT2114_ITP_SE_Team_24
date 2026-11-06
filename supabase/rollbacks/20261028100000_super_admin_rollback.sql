-- Rollback for 20261028100000_super_admin.sql
-- Redeploy the previous manage-users function and frontend first: they read
-- is_super_admin and no longer update users directly.
-- The audit table is kept (history); drop it by hand only if it is not needed.
begin;

drop trigger if exists log_user_account_change on public.users;
drop function if exists public.log_user_account_change();
drop trigger if exists guard_user_account_changes on public.users;
drop function if exists public.guard_user_account_changes();
drop function if exists public.is_super_admin();
drop index if exists public.users_single_super_admin;
alter table public.users drop constraint if exists users_super_admin_is_admin;
alter table public.users drop column if exists is_super_admin;

-- Baseline policy (20261007065859_remote_schema.sql). Restores R12.
drop policy if exists "Admins manage all users" on public.users;
create policy "Admins manage all users" on public.users
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
