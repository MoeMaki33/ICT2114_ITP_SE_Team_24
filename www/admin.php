<?php require __DIR__ . '/php/session-guard.php'; require_role('admin'); ?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin</title>
  <link rel="icon" type="image/png" href="<?php echo asset_v('img/application logo.png'); ?>">
  <link rel="stylesheet" href="<?php echo asset_v('css/style.css'); ?>">
</head>

<body>
  <aside class="sidebar"></aside>
  <main class="main">
    <header class="topbar"></header>
    <section class="content">
      <div class="page-title">
        <h1>Admin Management</h1>
        <p>Manage users and system access</p>
        <p class="muted" id="adminScopeNote" hidden>You manage engineer accounts. Only the Super Admin manages Admin accounts.</p>
      </div>

      <section class="card app-table-card">
        <div class="toolbar app-table-toolbar">
          <input id="searchInput" placeholder="Search users...">
          <button class="btn btn-green" id="openUserModalButton" type="button">+ Add User</button>
        </div>
        <div class="table-scroll app-table-scroll">
          <table class="app-table">
            <thead class="app-table-header">
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="userTableBody"></tbody>
          </table>
        </div>
      </section>
    </section>
  </main>

  <div class="modal" id="userModal">
    <div class="modal-card">
      <button class="modal-close" type="button" data-close-modal="userModal" aria-label="Close">&times;</button>
      <h2>Add User</h2>
      <label>Name</label>
      <input id="newName" placeholder="Full name">
      <label>Email</label>
      <input id="newEmail" type="email" placeholder="user@example.com">
      <label>Password</label>
      <input id="newPassword" type="password" placeholder="Temporary password">
      <label>Role</label>
      <select id="newRole">
        <option value="corrosion_engineer">Corrosion Engineer</option>
        <option value="admin">Admin</option>
      </select>
      <p id="createMsg" class="form-message" aria-live="polite"></p>
      <button class="btn btn-green full" id="createUserButton" type="button">Create User</button>
    </div>
  </div>

  <div class="modal" id="editModal">
    <div class="modal-card">
      <button class="modal-close" type="button" data-close-modal="editModal" aria-label="Close">&times;</button>
      <h2>Edit User</h2>
      <input type="hidden" id="editId">
      <label>Name</label>
      <input id="editName" placeholder="Full name">
      <label>Email</label>
      <input id="editEmail" type="email" placeholder="user@example.com">
      <label>Role</label>
      <select id="editRole">
        <option value="corrosion_engineer">Corrosion Engineer</option>
        <option value="admin">Admin</option>
      </select>
      <p id="editMsg" class="form-message" aria-live="polite"></p>
      <button class="btn btn-green full" id="updateUserButton" type="button">Save Changes</button>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="<?php echo asset_v('js/auth-storage.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/supabase-config.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/app-settings.js'); ?>"></script>
  <script src="<?php echo asset_v('js/supabaseClient.js'); ?>"></script>
  <script src="<?php echo asset_v('js/services/status.js'); ?>"></script>
  <script src="<?php echo asset_v('js/repositories/supabase-repositories.js'); ?>"></script>
  <script src="<?php echo asset_v('js/app-preferences.js'); ?>"></script>
  <script src="<?php echo asset_v('js/common.js'); ?>"></script>
  <script src="<?php echo asset_v('js/toast.js'); ?>"></script>
  <script src="<?php echo asset_v('js/notifications.js'); ?>"></script>
  <script src="<?php echo asset_v('js/navigation-controller.js'); ?>"></script>
  <script src="<?php echo asset_v('js/user-permissions.js'); ?>"></script>
  <script src="<?php echo asset_v('js/admin.js'); ?>"></script>
</body>

</html>
