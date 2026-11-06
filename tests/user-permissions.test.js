const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const browser = require("../www/js/user-permissions.js");

const root = path.join(__dirname, "..");
const edgePermissionsUrl = pathToFileURL(path.join(root, "supabase/functions/manage-users/permissions.mts")).href;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const superAdmin = { id: "sa", role: "admin", is_active: true, is_super_admin: true };
const admin = { id: "a1", role: "admin", is_active: true, is_super_admin: false };
const otherAdmin = { id: "a2", role: "admin", is_active: true, is_super_admin: false };
const inactiveAdmin = { id: "a3", role: "admin", is_active: false, is_super_admin: false };
const engineer = { id: "e1", role: "corrosion_engineer", is_active: true, is_super_admin: false };
const inactiveSuperAdmin = { ...superAdmin, is_active: false };
const accounts = { superAdmin, admin, otherAdmin, inactiveAdmin, engineer, inactiveSuperAdmin };

test("admins create engineers; only the Super Admin creates Admins", () => {
  assert.equal(browser.canCreateUser(admin, "corrosion_engineer"), true);
  assert.equal(browser.canCreateUser(admin, "admin"), false);
  assert.equal(browser.canCreateUser(superAdmin, "admin"), true);
  assert.equal(browser.canCreateUser(superAdmin, "corrosion_engineer"), true);
  assert.equal(browser.canCreateUser(superAdmin, "super_admin"), false, "no third role");
  assert.equal(browser.canCreateUser(engineer, "corrosion_engineer"), false);
  assert.equal(browser.canCreateUser(inactiveAdmin, "corrosion_engineer"), false);
  assert.equal(browser.canCreateUser(inactiveSuperAdmin, "admin"), false);
});

test("you only manage accounts below your level, never yourself or the Super Admin", () => {
  for (const rule of ["canDeleteUser", "canSetActive"]) {
    assert.equal(browser[rule](admin, engineer), true, `${rule}: admin -> engineer`);
    assert.equal(browser[rule](admin, otherAdmin), false, `${rule}: admin -> admin`);
    assert.equal(browser[rule](admin, superAdmin), false, `${rule}: admin -> super admin`);
    assert.equal(browser[rule](superAdmin, otherAdmin), true, `${rule}: super admin -> admin`);
    assert.equal(browser[rule](superAdmin, engineer), true, `${rule}: super admin -> engineer`);
    assert.equal(browser[rule](superAdmin, superAdmin), false, `${rule}: self`);
    assert.equal(browser[rule](admin, admin), false, `${rule}: self`);
    assert.equal(browser[rule](engineer, engineer), false, `${rule}: engineer`);
  }
});

test("only the Super Admin promotes or demotes Admins", () => {
  assert.equal(browser.canChangeRole(superAdmin, engineer), true);
  assert.equal(browser.canChangeRole(superAdmin, otherAdmin), true);
  assert.equal(browser.canChangeRole(superAdmin, superAdmin), false);
  assert.equal(browser.canChangeRole(admin, engineer), false);
  assert.equal(browser.canChangeRole(admin, otherAdmin), false);
});

test("details: admins edit engineers and themselves; the Super Admin edits everyone", () => {
  assert.equal(browser.canEditDetails(admin, engineer), true);
  assert.equal(browser.canEditDetails(admin, admin), true);
  assert.equal(browser.canEditDetails(admin, otherAdmin), false);
  assert.equal(browser.canEditDetails(admin, superAdmin), false);
  assert.equal(browser.canEditDetails(superAdmin, otherAdmin), true);
  assert.equal(browser.canEditDetails(superAdmin, superAdmin), true);
  assert.equal(browser.canEditDetails(engineer, engineer), false, "engineers have no admin page");
});

test("role labels", () => {
  assert.equal(browser.displayRole(superAdmin), "Super Admin");
  assert.equal(browser.displayRole(admin), "Admin");
  assert.equal(browser.displayRole(engineer), "Corrosion Engineer");
  assert.equal(browser.displayRole(null), "User");
});

test("Edge Function rules match the browser rules for every caller/target pair", async () => {
  const edge = await import(edgePermissionsUrl);
  assert.deepEqual(edge.ROLES, browser.ROLES);
  const people = [...Object.values(accounts), null];
  for (const caller of people) {
    assert.equal(edge.isSuperAdmin(caller), browser.isSuperAdmin(caller));
    for (const role of [...browser.ROLES, "super_admin"]) {
      assert.equal(edge.canCreateUser(caller, role), browser.canCreateUser(caller, role), `canCreateUser(${caller?.id}, ${role})`);
    }
    for (const target of people) {
      for (const rule of ["canDeleteUser", "canEditDetails", "canChangeRole", "canSetActive"]) {
        assert.equal(edge[rule](caller, target), browser[rule](caller, target), `${rule}(${caller?.id}, ${target?.id})`);
      }
    }
  }
});

test("migration: one Super Admin, no browser writes (R12), audit log", () => {
  const sql = read("supabase/migrations/20261028100000_super_admin.sql");
  assert.match(sql, /add column if not exists is_super_admin boolean not null default false/);
  assert.match(sql, /check \(not is_super_admin or \(role = 'admin' and is_active\)\)/);
  assert.match(sql, /create unique index if not exists users_single_super_admin\s+on public\.users \(\(true\)\) where is_super_admin/);
  assert.match(sql, /drop policy if exists "Admins manage all users" on public\.users;/);
  assert.doesNotMatch(sql, /create policy "Admins manage all users"/);
  assert.match(sql, /current_user in \('authenticated', 'anon'\)/);
  assert.match(sql, /function public\.guard_user_account_changes\(\)[\s\S]*?security invoker/);
  assert.match(sql, /before insert or update or delete on public\.users/);
  assert.match(sql, /after insert or update or delete on public\.users/);
  assert.match(sql, /alter table public\.user_account_changes enable row level security;/);
  // Every function sets an explicit, empty search_path.
  assert.equal((sql.match(/create or replace function/g) || []).length, 3);
  assert.equal((sql.match(/set search_path = ''/g) || []).length, 3);
  assert.doesNotMatch(sql, /'super_admin'/, "no third role value");
});

test("manage-users checks permissions before every service-role write", () => {
  const source = read("supabase/functions/manage-users/index.ts");
  assert.match(source, /from "\.\/permissions\.mts"/);
  assert.match(source, /callerAccount\.is_active !== true/);
  assert.match(source, /"X-CPM-Actor-Id": caller\.id/);
  const before = (action, check, write) => {
    const start = source.indexOf(`action === '${action}'`);
    assert.ok(start > 0, action);
    assert.ok(source.indexOf(check, start) < source.indexOf(write, start), `${action}: ${check} before ${write}`);
  };
  before("create", "canCreateUser(callerAccount, role)", "auth.admin.createUser");
  before("update", "canChangeRole(callerAccount, target)", "auth.admin.updateUserById");
  before("update", "canSetActive(callerAccount, target)", "auth.admin.updateUserById");
  before("delete", "canDeleteUser(callerAccount, target)", "auth.admin.deleteUser");
});

test("the admin page never writes to users directly", () => {
  const source = read("www/js/admin.js");
  assert.doesNotMatch(source, /\.from\("users"\)\s*\.(update|insert|delete|upsert)\(/);
  assert.match(source, /callManageUsers\(\{ action: "update", id: user\.id, is_active: !user\.is_active \}\)/);
});

// Runs admin.js with stub elements, signed in as `caller`, so rows and the Edit form can be checked.
function loadAdminPage(caller, users) {
  const elements = {};
  const element = (id) => (elements[id] ||= { id, value: "", innerHTML: "", hidden: false, disabled: false, addEventListener() {} });
  const adminOption = { textContent: "Admin" };
  element("editRole").querySelector = () => adminOption;
  const context = vm.createContext({
    window: { SUPABASE_CONFIG: { url: "https://example.supabase.co" }, UserPermissions: browser },
    document: { getElementById: element, addEventListener() {}, querySelectorAll: () => [] },
    openModal() {},
    state: { caller, users },
  });
  vm.runInContext(read("www/js/admin.js"), context);
  vm.runInContext("adminState.users = state.users; adminState.currentUser = state.caller; adminState.currentUserId = state.caller.id;", context);
  const rows = () => {
    context.renderUsers();
    return element("userTableBody").innerHTML.split("<tr>").slice(1);
  };
  return { context, element, adminOption, rows };
}

test("the admin page has no Deactivate on your own row; other rows keep it", () => {
  const [own, adminRow, engineerRow] = loadAdminPage(superAdmin, [superAdmin, admin, engineer]).rows();
  assert.doesNotMatch(own, /data-admin-toggle|data-admin-delete/);
  assert.match(adminRow, /data-admin-toggle="a1"\s*>/);
  assert.match(engineerRow, /data-admin-toggle="e1"\s*>/);

  // A plain Admin still sees the Super Admin's Deactivate, disabled with the reason.
  const [superAdminRow, ownAdminRow] = loadAdminPage(admin, [superAdmin, admin]).rows();
  assert.match(superAdminRow, /data-admin-toggle="sa"\s*disabled title="The Super Admin account can only be changed by the database owner"/);
  assert.doesNotMatch(ownAdminRow, /data-admin-toggle/);
});

test("the Edit form labels the Super Admin's role as Super Admin without changing its value", () => {
  const page = loadAdminPage(superAdmin, [superAdmin, admin, engineer]);
  page.context.openEditModal("sa");
  assert.equal(page.adminOption.textContent, "Super Admin");
  assert.equal(page.element("editRole").value, "admin");
  assert.equal(page.element("editRole").disabled, true);
  page.context.openEditModal("a1");
  assert.equal(page.adminOption.textContent, "Admin");
});

test("sign-in and the admin page work before the Super Admin migration is applied", () => {
  // Naming is_super_admin in a select fails with "column does not exist" on a database
  // without the migration, which signs every user out (autoGuard -> redirectToLogin).
  for (const file of ["www/js/repositories/supabase-repositories.js", "www/js/admin.js", "www/js/common.js"]) {
    assert.doesNotMatch(read(file), /\.select\([^)]*is_super_admin/, file);
  }
});
