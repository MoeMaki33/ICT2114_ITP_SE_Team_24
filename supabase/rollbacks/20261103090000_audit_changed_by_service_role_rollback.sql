-- Rollback for 20261103090000_audit_changed_by_service_role.sql.
-- Deletes made through manage-users are then logged with changed_by = null again.

revoke update (changed_by) on table public.user_account_changes from service_role;
revoke select on table public.user_account_changes from service_role;
