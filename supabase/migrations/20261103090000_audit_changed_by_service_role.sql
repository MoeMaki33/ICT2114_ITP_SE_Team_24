-- Let manage-users record who deleted an account (D-ROLE-1, #49).
--
-- Deleting the sign-in account cascades to public.users inside Auth, without the
-- X-CPM-Actor-Id header, so the audit trigger writes the "deleted" row with
-- changed_by = null. manage-users then fills changed_by with the service role.
-- The baseline revokes default table privileges from service_role, and
-- 20261028100000 granted nothing on user_account_changes, so that update was
-- refused and changed_by stayed null (found by tests/db-staging.test.js on staging).
--
-- Only the server-side role gets this, and only changed_by can be updated.
-- Browser roles (anon, authenticated) stay read-only as before.

grant select on table public.user_account_changes to service_role;
grant update (changed_by) on table public.user_account_changes to service_role;
