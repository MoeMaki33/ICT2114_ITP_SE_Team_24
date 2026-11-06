-- Super Admin (D-ROLE-1) and R12 checks. Run in the SQL editor of the target project
-- (staging first). Section 1 is read-only; every row should show ok = true.
-- Section 2 simulates callers inside transactions that are ROLLED BACK.

-- 1. Schema, privileges and data
select 'is_super_admin column exists' as check_name,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'users' and column_name = 'is_super_admin') as ok
union all
select 'Super Admin must be an active admin (check constraint)',
       exists (select 1 from pg_constraint where conname = 'users_super_admin_is_admin')
union all
select 'at most one Super Admin (unique index)',
       exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'users_single_super_admin')
union all
select 'R12: no browser write policy on users',
       not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'users' and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE'))
union all
select 'guard and audit triggers on public.users',
       (select count(*) from pg_trigger
        where tgrelid = 'public.users'::regclass and not tgisinternal
          and tgname in ('guard_user_account_changes', 'log_user_account_change')) = 2
union all
select 'is_super_admin() callable by authenticated, not anon',
       has_function_privilege('authenticated', 'public.is_super_admin()', 'execute')
       and not has_function_privilege('anon', 'public.is_super_admin()', 'execute')
union all
select 'audit table: RLS on, browser read-only',
       (select relrowsecurity from pg_class where oid = 'public.user_account_changes'::regclass)
       and has_table_privilege('authenticated', 'public.user_account_changes', 'select')
       and not has_table_privilege('authenticated', 'public.user_account_changes', 'insert')
       and not has_table_privilege('anon', 'public.user_account_changes', 'select')
union all
select 'exactly one active Super Admin assigned',
       (select count(*) from public.users where is_super_admin and is_active and role = 'admin') = 1;

-- Who holds it, and the latest account changes:
-- select id, email, role, is_active, is_super_admin from public.users where is_super_admin;
-- select * from public.user_account_changes order by id desc limit 20;

-- 2. Simulated callers (replace the uuids; every block rolls back). Run one block at a time.
--
-- A signed-in admin updates any users row directly -> UPDATE 0 (no write policy, R12 closed)
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', '<admin-uuid>', 'role', 'authenticated')::text, true);
--   update public.users set role = 'admin' where id = '<engineer-uuid>';
-- rollback;
--
-- manage-users (service role) tries to deactivate the Super Admin
--   -> "The Super Admin cannot be demoted or deactivated"
-- begin;
--   set local role service_role;
--   update public.users set is_active = false where is_super_admin;
-- rollback;
--
-- manage-users (service role) tries to set the flag directly -> "The Super Admin is changed only by the database owner"
-- begin;
--   set local role service_role;
--   update public.users set is_super_admin = true where id = '<admin-uuid>';
-- rollback;
--
-- A second Super Admin, even as postgres -> duplicate key value violates unique constraint "users_single_super_admin"
-- begin;
--   update public.users set is_super_admin = true where id = '<admin-uuid>';
-- rollback;
--
-- Owner handover works and is logged (as postgres, then rolled back)
-- begin;
--   update public.users set is_super_admin = false where is_super_admin;
--   update public.users set is_super_admin = true where id = '<admin-uuid>' and role = 'admin' and is_active;
--   select id, email, is_super_admin from public.users where is_super_admin;
--   select * from public.user_account_changes order by id desc limit 2;
-- rollback;
