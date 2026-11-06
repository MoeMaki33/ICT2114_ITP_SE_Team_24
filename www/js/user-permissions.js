/**
 * Who may manage which user account (D-ROLE-1, confirmed 28 Oct): the Super Admin
 * has Admin permissions plus managing Admins; Admins manage engineers only; nobody
 * manages their own account; the single Super Admin is assigned only by the
 * database owner.
 *
 * Used by admin.js to show or hide controls. The manage-users Edge Function
 * (supabase/functions/manage-users/permissions.mts) enforces the same rules and the
 * database guard trigger backs them up; tests/user-permissions.test.js checks the
 * browser and Edge Function copies agree.
 *
 * Accounts are users rows: { id, role, is_active, is_super_admin }.
 */
(function (root) {
  const ROLES = ["corrosion_engineer", "admin"];

  function isSuperAdmin(account) {
    return Boolean(account) && account.role === "admin" && account.is_active !== false && account.is_super_admin === true;
  }

  function isActiveAdmin(account) {
    return Boolean(account) && account.role === "admin" && account.is_active !== false;
  }

  function isSelf(caller, target) {
    return Boolean(caller && target) && caller.id === target.id;
  }

  /** The caller outranks the target: the Super Admin manages everyone else, an Admin manages engineers. */
  function manages(caller, target) {
    if (!target || isSelf(caller, target) || target.is_super_admin) return false;
    if (isSuperAdmin(caller)) return true;
    return isActiveAdmin(caller) && target.role === "corrosion_engineer";
  }

  /** Create an account with this role. */
  function canCreateUser(caller, role) {
    if (!ROLES.includes(role)) return false;
    if (isSuperAdmin(caller)) return true;
    return isActiveAdmin(caller) && role === "corrosion_engineer";
  }

  function canDeleteUser(caller, target) {
    return manages(caller, target);
  }

  /** Edit name / email: accounts you manage, and your own. */
  function canEditDetails(caller, target) {
    if (!target || !isActiveAdmin(caller)) return false;
    return isSelf(caller, target) || manages(caller, target);
  }

  /** Promote an engineer to Admin or demote an Admin: managing Admins, Super Admin only. */
  function canChangeRole(caller, target) {
    return isSuperAdmin(caller) && manages(caller, target);
  }

  function canSetActive(caller, target) {
    return manages(caller, target);
  }

  function displayRole(account) {
    if (account?.role === "admin") return account.is_super_admin ? "Super Admin" : "Admin";
    if (account?.role === "corrosion_engineer") return "Corrosion Engineer";
    return "User";
  }

  const api = {
    ROLES,
    isSuperAdmin,
    canCreateUser,
    canDeleteUser,
    canEditDetails,
    canChangeRole,
    canSetActive,
    displayRole,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.UserPermissions = api;
})(typeof window !== "undefined" ? window : null);
