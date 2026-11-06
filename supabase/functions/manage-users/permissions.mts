// Account-management rules for manage-users (D-ROLE-1, confirmed 28 Oct). Keep in step
// with www/js/user-permissions.js; tests/user-permissions.test.js checks both agree.
// Plain erasable TypeScript so Node's type stripping can import it in tests.

export interface Account {
  id: string;
  role: string;
  is_active?: boolean | null;
  is_super_admin?: boolean | null;
}

type Maybe = Account | null | undefined;

export const ROLES = ["corrosion_engineer", "admin"];

export function isSuperAdmin(account: Maybe): boolean {
  return Boolean(account) && account!.role === "admin" && account!.is_active !== false && account!.is_super_admin === true;
}

function isActiveAdmin(account: Maybe): boolean {
  return Boolean(account) && account!.role === "admin" && account!.is_active !== false;
}

function isSelf(caller: Maybe, target: Maybe): boolean {
  return Boolean(caller && target) && caller!.id === target!.id;
}

function manages(caller: Maybe, target: Maybe): boolean {
  if (!target || isSelf(caller, target) || target.is_super_admin) return false;
  if (isSuperAdmin(caller)) return true;
  return isActiveAdmin(caller) && target.role === "corrosion_engineer";
}

export function canCreateUser(caller: Maybe, role: string): boolean {
  if (!ROLES.includes(role)) return false;
  if (isSuperAdmin(caller)) return true;
  return isActiveAdmin(caller) && role === "corrosion_engineer";
}

export function canDeleteUser(caller: Maybe, target: Maybe): boolean {
  return manages(caller, target);
}

export function canEditDetails(caller: Maybe, target: Maybe): boolean {
  if (!target || !isActiveAdmin(caller)) return false;
  return isSelf(caller, target) || manages(caller, target);
}

export function canChangeRole(caller: Maybe, target: Maybe): boolean {
  return isSuperAdmin(caller) && manages(caller, target);
}

export function canSetActive(caller: Maybe, target: Maybe): boolean {
  return manages(caller, target);
}
