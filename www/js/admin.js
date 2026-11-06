const MANAGE_USERS_FUNCTION_URL = `${window.SUPABASE_CONFIG.url}/functions/v1/manage-users`;

const adminState = {
  users: [],
  currentUserId: null,
  currentUser: null,
};

const userPermissions = window.UserPermissions;

function adminElement(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function setFormMessage(id, message, type = "muted") {
  const element = adminElement(id);
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${type}`;
}

function displayRole(user) {
  return userPermissions.displayRole(user);
}

async function getAdminSession() {
  const {
    data: { session },
  } = await window.appSupabase.auth.getSession();
  if (!session) throw new Error("Not authenticated.");
  return session;
}

async function callManageUsers(payload) {
  const session = await getAdminSession();
  const response = await fetch(MANAGE_USERS_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

async function loadUsers() {
  const tbody = adminElement("userTableBody");
  tbody.innerHTML = '<tr><td colspan="5">Loading users…</td></tr>';

  const { data, error } = await window.appSupabase
    .from("users")
    // "*": is_super_admin only exists once the Super Admin migration is applied.
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="5">Failed: ${escapeHtml(error?.message || "Unable to load users.")}</td></tr>`;
    return;
  }

  adminState.users = data;
  adminState.currentUser = data.find((user) => user.id === adminState.currentUserId) || null;
  applyAdminScope();
  renderUsers();
}

function getFilteredUsers() {
  const query = adminElement("searchInput").value.trim().toLowerCase();
  if (!query) return adminState.users;
  return adminState.users.filter((user) => (
    [user.full_name, user.email, displayRole(user)]
      .join(" ")
      .toLowerCase()
      .includes(query)
  ));
}

function renderUsers() {
  const tbody = adminElement("userTableBody");
  const users = getFilteredUsers();
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((user) => {
    const caller = adminState.currentUser;
    const isSelf = user.id === adminState.currentUserId;
    const isActive = Boolean(user.is_active);
    const canEdit = userPermissions.canEditDetails(caller, user);
    const canToggle = userPermissions.canSetActive(caller, user);
    const lockedReason = user.is_super_admin ? "The Super Admin account can only be changed by the database owner"
      : "Only the Super Admin manages Admin accounts";
    return `
      <tr>
        <td>${escapeHtml(user.full_name || "—")} ${isSelf ? '<span class="badge gray-bg">You</span>' : ""}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(displayRole(user))}</td>
        <td><span class="badge ${isActive ? "green-bg" : "gray-bg"}">${isActive ? "Active" : "Inactive"}</span></td>
        <td>
          <button class="btn btn-light" type="button" data-admin-edit="${escapeHtml(user.id)}"
            ${canEdit ? "" : `disabled title="${escapeHtml(lockedReason)}"`}>Edit</button>
          ${isSelf ? "" : `<button class="btn ${isActive ? "btn-red" : "btn-green"}" type="button"
            data-admin-toggle="${escapeHtml(user.id)}"
            ${canToggle ? "" : `disabled title="${escapeHtml(lockedReason)}"`}>
            ${isActive ? "Deactivate" : "Activate"}
          </button>`}
          ${userPermissions.canDeleteUser(caller, user)
            ? `<button class="btn btn-red" type="button" data-admin-delete="${escapeHtml(user.id)}">Delete</button>`
            : ""}
        </td>
      </tr>`;
  }).join("");
}

function applyAdminScope() {
  const caller = adminState.currentUser;
  adminElement("openUserModalButton").hidden = !userPermissions.canCreateUser(caller, "corrosion_engineer");
  adminElement("adminScopeNote").hidden = userPermissions.isSuperAdmin(caller);
  // Only the Super Admin can create Admin accounts.
  const canCreateAdmin = userPermissions.canCreateUser(caller, "admin");
  document.querySelectorAll('#newRole option[value="admin"]').forEach((option) => {
    option.hidden = !canCreateAdmin;
    option.disabled = !canCreateAdmin;
  });
}

function clearCreateForm() {
  ["newName", "newEmail", "newPassword"].forEach((id) => {
    adminElement(id).value = "";
  });
  adminElement("newRole").value = "corrosion_engineer";
  setFormMessage("createMsg", "");
}

function openEditModal(userId) {
  const user = adminState.users.find((item) => item.id === userId);
  if (!user || !userPermissions.canEditDetails(adminState.currentUser, user)) return;
  const isSelf = user.id === adminState.currentUserId;
  const canChangeRole = userPermissions.canChangeRole(adminState.currentUser, user);
  const roleNote = isSelf ? "You cannot change your own role."
    : user.is_super_admin ? "The Super Admin is assigned by the database owner."
    : "Only the Super Admin can promote or demote Admins.";

  adminElement("editId").value = user.id;
  adminElement("editName").value = user.full_name || "";
  adminElement("editEmail").value = user.email || "";
  adminElement("editRole").value = user.role || "corrosion_engineer";
  // The Super Admin is stored as role "admin"; label it by its title (the value stays "admin").
  adminElement("editRole").querySelector('option[value="admin"]').textContent = user.is_super_admin ? "Super Admin" : "Admin";
  adminElement("editRole").disabled = !canChangeRole;
  setFormMessage("editMsg", canChangeRole ? "" : roleNote, "muted");
  openModal("editModal");
}

async function createUser() {
  const name = adminElement("newName").value.trim();
  const email = adminElement("newEmail").value.trim();
  const password = adminElement("newPassword").value.trim();
  const role = adminElement("newRole").value;

  if (!name || !email || !password) {
    setFormMessage("createMsg", "All fields are required.", "error");
    return;
  }

  setFormMessage("createMsg", "Creating…", "muted");
  try {
    await callManageUsers({ action: "create", name, email, password, role });
    setFormMessage("createMsg", "User created successfully.", "success");
    clearCreateForm();
    await loadUsers();
  } catch (error) {
    setFormMessage("createMsg", error.message || "Failed to create user.", "error");
  }
}

async function updateUser() {
  const id = adminElement("editId").value;
  const name = adminElement("editName").value.trim();
  const email = adminElement("editEmail").value.trim();
  const role = adminElement("editRole").value;

  if (!name || !email) {
    setFormMessage("editMsg", "Name and email are required.", "error");
    return;
  }

  const original = adminState.users.find((user) => user.id === id);
  const roleChanged = Boolean(original) && role !== original.role;
  if (roleChanged && !userPermissions.canChangeRole(adminState.currentUser, original)) {
    setFormMessage("editMsg", "You cannot change this user's role.", "error");
    return;
  }

  setFormMessage("editMsg", "Saving…", "muted");
  try {
    await callManageUsers({ action: "update", id, name, email, ...(roleChanged ? { role } : {}) });
    setFormMessage("editMsg", "Updated successfully.", "success");
    await loadUsers();
  } catch (error) {
    setFormMessage("editMsg", error.message || "Failed to update user.", "error");
  }
}

async function toggleActive(userId) {
  const user = adminState.users.find((item) => item.id === userId);
  if (!user) return;
  if (!userPermissions.canSetActive(adminState.currentUser, user)) {
    window.notifyUser?.("You cannot change this account's status.", "warning");
    return;
  }

  const action = user.is_active ? "deactivate" : "activate";
  if (!confirm(`Are you sure you want to ${action} this user?`)) return;

  // All user changes go through manage-users (R12); the browser has no write access.
  try {
    await callManageUsers({ action: "update", id: user.id, is_active: !user.is_active });
  } catch (error) {
    window.notifyUser?.(error.message || "Failed to change status.", "error");
    return;
  }
  await loadUsers();
}

async function deleteUser(userId) {
  const user = adminState.users.find((item) => item.id === userId);
  if (!user || !userPermissions.canDeleteUser(adminState.currentUser, user)) return;
  if (!confirm(`Permanently delete ${user.full_name || user.email}? This cannot be undone.`)) return;

  try {
    await callManageUsers({ action: "delete", id: user.id });
    window.notifyUser?.("User deleted.", "success");
  } catch (error) {
    window.notifyUser?.(error.message || "Failed to delete user.", "error");
  }
  await loadUsers();
}

function bindAdminEvents() {
  adminElement("searchInput").addEventListener("input", renderUsers);
  adminElement("openUserModalButton").addEventListener("click", () => {
    clearCreateForm();
    openModal("userModal");
  });
  adminElement("createUserButton").addEventListener("click", createUser);
  adminElement("updateUserButton").addEventListener("click", updateUser);

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  adminElement("userTableBody").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-admin-edit]");
    if (editButton) openEditModal(editButton.dataset.adminEdit);

    const toggleButton = event.target.closest("[data-admin-toggle]");
    if (toggleButton) toggleActive(toggleButton.dataset.adminToggle);

    const deleteButton = event.target.closest("[data-admin-delete]");
    if (deleteButton) deleteUser(deleteButton.dataset.adminDelete);
  });
}

async function initAdminPage() {
  bindAdminEvents();
  const {
    data: { user },
  } = await window.appSupabase.auth.getUser();
  adminState.currentUserId = user?.id || null;
  await loadUsers();
}

function destroyAdminPage() {}

window.AdminPage = { init: initAdminPage, destroy: destroyAdminPage };

document.addEventListener("DOMContentLoaded", () => {
  const page = window.getCurrentPageName?.() || location.pathname.split("/").pop();
  if (page === "admin.php") initAdminPage();
});
