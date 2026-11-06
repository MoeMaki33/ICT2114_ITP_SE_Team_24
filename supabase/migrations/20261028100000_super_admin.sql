-- 20261028100000_super_admin.sql  (D-ROLE-1, #49; closes R12)
-- PREPARED, NOT APPLIED. Staging first (docs/handoff/super-admin-and-readings-api.md).
-- Rollback: supabase/rollbacks/20261028100000_super_admin_rollback.sql
--
-- Confirmed scope (docs/decisions.md, 28 Oct): the Super Admin has the same permissions
-- as an Admin plus managing Admins; Admins manage engineers only; exactly ONE Super
-- Admin; role changes are logged. Only the database owner assigns or hands over the
-- Super Admin (SQL below).
--
-- Built as a flag on an admin row, not a third role value: every existing check on
-- role = 'admin' (is_admin(), current_user_is_admin(), RLS, ingest_reading_v1, ...)
-- keeps working for the Super Admin, and app_users_role_check is unchanged.
--
-- R12: the browser could update any users row through "Admins manage all users".
-- That policy is replaced by nothing: every user change goes through manage-users
-- (service role, with level checks), and the guard trigger refuses direct writes.
--
-- After applying, the database owner assigns the first Super Admin once (SQL editor):
--   update public.users set is_super_admin = true
--   where email = '<agreed account email>' and role = 'admin' and is_active;
--
-- Handover to another active Admin later (database owner, SQL editor, one transaction):
--   begin;
--   update public.users set is_super_admin = false where is_super_admin;
--   update public.users set is_super_admin = true
--   where email = '<new holder email>' and role = 'admin' and is_active;
--   commit;
begin;

-- 1. Flag: admins only, at most one row.
alter table public.users add column if not exists is_super_admin boolean not null default false;

alter table public.users drop constraint if exists users_super_admin_is_admin;
alter table public.users add constraint users_super_admin_is_admin
  check (not is_super_admin or (role = 'admin' and is_active));

create unique index if not exists users_single_super_admin
  on public.users ((true)) where is_super_admin;

comment on column public.users.is_super_admin is
  'D-ROLE-1: the single Super Admin (Admin + managing Admins). Assigned and handed over only by the database owner (SQL editor).';

-- 2. R12: no browser writes to users. Reads are unchanged ("Admins read all users",
--    "Users read own profile").
drop policy if exists "Admins manage all users" on public.users;

-- 3. Helper for the app and RLS.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and is_active = true and is_super_admin = true
  );
$$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- 4. Guard. SECURITY INVOKER on purpose: current_user is the caller's database role.
--    * authenticated / anon (browser, any API client): no writes at all;
--    * service_role (manage-users, after its own level checks): cannot create, remove,
--      demote or deactivate the Super Admin;
--    * postgres / table owner (SQL editor, and foreign-key cascades, which Postgres runs
--      as the table owner): trusted, so the database owner can assign or hand over the
--      Super Admin. manage-users refuses to delete the Super Admin before calling Auth,
--      so only the hosting owner can remove that account.
create or replace function public.guard_user_account_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'User accounts are changed through manage-users only' using errcode = '42501';
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.is_super_admin then
      raise exception 'The Super Admin is assigned only by the database owner' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.is_super_admin then
      raise exception 'The Super Admin account cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'The Super Admin is changed only by the database owner' using errcode = '42501';
  end if;
  if old.is_super_admin and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'The Super Admin cannot be demoted or deactivated' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_user_account_changes() from public, anon, authenticated;

drop trigger if exists guard_user_account_changes on public.users;
create trigger guard_user_account_changes
  before insert or update or delete on public.users
  for each row execute function public.guard_user_account_changes();

-- 5. Audit log of account changes (create, delete, role, status, Super Admin).
create table if not exists public.user_account_changes (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null,
  user_email         text,
  changed_by         uuid,
  action             text not null check (action in ('created', 'updated', 'deleted')),
  old_role           text,
  new_role           text,
  old_is_active      boolean,
  new_is_active      boolean,
  old_is_super_admin boolean,
  new_is_super_admin boolean,
  changed_at         timestamptz not null default now()
);

comment on table public.user_account_changes is
  'D-ROLE-1: who changed which account''s role / status / Super Admin flag, and when. changed_by is null for SQL-editor changes.';

create index if not exists user_account_changes_user_id_idx on public.user_account_changes (user_id, changed_at desc);

alter table public.user_account_changes enable row level security;

drop policy if exists "Admins read account changes" on public.user_account_changes;
create policy "Admins read account changes"
  on public.user_account_changes for select
  to authenticated
  using ((select public.current_user_is_admin()));

-- Written only by the trigger below; the browser may read (RLS: admins).
revoke all on public.user_account_changes from public, anon, authenticated;
grant select on public.user_account_changes to authenticated;

-- The actor: the signed-in user, else the X-CPM-Actor-Id header manage-users sends
-- with its service-role requests (null for SQL-editor changes).
create or replace function public.log_user_account_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_header text := coalesce(current_setting('request.headers', true), '');
  v_actor_text text;
  v_actor uuid := auth.uid();
begin
  if tg_op = 'UPDATE'
     and new.role is not distinct from old.role
     and new.is_active is not distinct from old.is_active
     and new.is_super_admin is not distinct from old.is_super_admin then
    return null;
  end if;
  if v_actor is null then
    v_actor_text := case when v_header like '{%' then v_header::jsonb ->> 'x-cpm-actor-id' end;
    if v_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_actor := v_actor_text::uuid;
    end if;
  end if;

  insert into public.user_account_changes (
    user_id, user_email, changed_by, action,
    old_role, new_role, old_is_active, new_is_active, old_is_super_admin, new_is_super_admin)
  values (
    coalesce(new.id, old.id), coalesce(new.email, old.email), v_actor,
    case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
    old.role, new.role, old.is_active, new.is_active, old.is_super_admin, new.is_super_admin);
  return null;
end;
$$;

revoke all on function public.log_user_account_change() from public, anon, authenticated;

drop trigger if exists log_user_account_change on public.users;
create trigger log_user_account_change
  after insert or update or delete on public.users
  for each row execute function public.log_user_account_change();

commit;
