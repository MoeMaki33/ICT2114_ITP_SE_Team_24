const fontAwesomeKitUrl = "https://kit.fontawesome.com/b68c73c6bb.js";

function escapeCommonHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

const navItems = [
  ["dashboard.php", "Dashboard", "fa-border-all"],
  ["testpoints.php", "Test Points", "fa-bullseye"],
  ["weekly.php", "Weekly Summary", "fa-arrow-trend-up"],
  ["asset-map.php", "Asset Map", "fa-map"],
  ["history.php", "Data History", "fa-clock-rotate-left"],
  ["settings.php", "Settings", "fa-gear"],
  ["admin.php", "Admin", "fa-user-shield"],
];

const publicPages = ["index.php", "forgot-password.php", "reset-password.php", ""];
const adminPages = ["admin.php"];
const authGuardEnabled = true;
const mobileNavigationBreakpoint = 992;
let mobileNavigationReturnFocus = null;

function loadFontAwesome() {
  if (document.querySelector(`script[src="${fontAwesomeKitUrl}"]`)) return;

  const script = document.createElement("script");
  script.src = fontAwesomeKitUrl;
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
}

function icon(name, extraClass = "") {
  return `<i class="fa-solid ${name} ${extraClass}" aria-hidden="true"></i>`;
}

function getPageTitle(page) {
  return navItems.find(([href]) => href === page)?.[1] || "Corrosion Dashboard";
}

function getCurrentPageName() {
  return location.pathname.split("/").pop() || "index.php";
}

function getDisplayRole(role, isSuperAdmin = false) {
  if (role === "corrosion_engineer") return "Corrosion Engineer";
  if (role === "admin") return isSuperAdmin ? "Super Admin" : "Admin";
  return "User";
}

function getInitials(fullName) {
  const trimmedName = String(fullName || "").trim();
  if (!trimmedName) return "??";

  const parts = trimmedName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function isMobileNavigationViewport() {
  return window.innerWidth < mobileNavigationBreakpoint;
}

function openMobileNavigation() {
  if (!isMobileNavigationViewport()) return;
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const menuButton = document.getElementById("sidebarToggle");
  if (!sidebar || !overlay || !menuButton) return;

  mobileNavigationReturnFocus = document.activeElement;
  sidebar.classList.add("is-open");
  sidebar.inert = false;
  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("nav-open");
  menuButton.setAttribute("aria-expanded", "true");
  sidebar.setAttribute("aria-hidden", "false");
  sidebar.querySelector(".sidebar-close")?.focus();
}

function closeMobileNavigation({ restoreFocus = true } = {}) {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const menuButton = document.getElementById("sidebarToggle");
  if (!sidebar || !overlay || !menuButton) return;

  sidebar.classList.remove("is-open");
  sidebar.inert = isMobileNavigationViewport();
  overlay.classList.remove("is-visible");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("nav-open");
  menuButton.setAttribute("aria-expanded", "false");
  sidebar.setAttribute("aria-hidden", String(isMobileNavigationViewport()));
  if (restoreFocus) (mobileNavigationReturnFocus || menuButton).focus?.();
  mobileNavigationReturnFocus = null;
}

function toggleMobileNavigation() {
  if (document.querySelector(".sidebar")?.classList.contains("is-open")) {
    closeMobileNavigation();
  } else {
    openMobileNavigation();
  }
}

function handleViewportChange() {
  const sidebar = document.querySelector(".sidebar");
  const menuButton = document.getElementById("sidebarToggle");
  if (!sidebar || !menuButton) return;

  if (isMobileNavigationViewport()) {
    document.body.classList.remove("sidebar-collapsed");
    sidebar.setAttribute("aria-hidden", String(!sidebar.classList.contains("is-open")));
    sidebar.inert = !sidebar.classList.contains("is-open");
    menuButton.setAttribute("aria-label", "Open navigation menu");
  } else {
    closeMobileNavigation({ restoreFocus: false });
    document.body.classList.toggle("sidebar-collapsed", localStorage.getItem("sidebarCollapsed") === "true");
    sidebar.setAttribute("aria-hidden", "false");
    sidebar.inert = false;
    menuButton.setAttribute("aria-label", "Collapse sidebar");
  }
}

function bindResponsiveNavigation() {
  if (document.body.dataset.navigationBound === "true") return;
  document.body.dataset.navigationBound = "true";

  document.addEventListener("click", (event) => {
    if (event.target.closest("#sidebarToggle")) {
      if (isMobileNavigationViewport()) {
        toggleMobileNavigation();
      } else {
        const isCollapsed = document.body.classList.toggle("sidebar-collapsed");
        localStorage.setItem("sidebarCollapsed", String(isCollapsed));
      }
    }
    if (event.target.closest(".sidebar-close, #sidebarOverlay")) closeMobileNavigation();
    if (event.target.closest(".sidebar .nav a") && isMobileNavigationViewport()) {
      closeMobileNavigation({ restoreFocus: false });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
      closeMobileNavigation();
    }
  });
  window.addEventListener("resize", handleViewportChange);
}

function buildLayout() {
  loadFontAwesome();

  const page = getCurrentPageName();
  const role = localStorage.getItem("userRole") || "";
  const fullName = localStorage.getItem("userFullName") || "";
  const initials = localStorage.getItem("userInitials") || getInitials(fullName);
  const displayRole = getDisplayRole(role, localStorage.getItem("userIsSuperAdmin") === "true");
  const visibleNav = navItems.filter(([href]) => href !== "admin.php" || role === "admin");

  document.body.classList.toggle("sidebar-collapsed", localStorage.getItem("sidebarCollapsed") === "true");

  const sidebar = document.querySelector(".sidebar");
  const topbar = document.querySelector(".topbar");

  if (sidebar) {
    sidebar.innerHTML = `
      <div class="side-logo">
        <img src="assets/brand/newcastle-logo-reversed.svg" alt="Newcastle University" class="app-brand-logo">
        <span class="app-brand-compact" aria-hidden="true">NU</span>
        <button class="sidebar-close" type="button" aria-label="Close navigation menu">${icon("fa-xmark")}</button>
      </div>
      <div class="nav-label">Main Menu</div>
      <nav class="nav">
        ${visibleNav
          .map(
            ([href, label, iconName]) => `
              <a class="sidebar-nav-link ${page === href ? "active" : ""}" href="${href}" ${page === href ? 'aria-current="page"' : ""}>
                ${icon(iconName)}<span>${label}</span>
              </a>
            `
          )
          .join("")}
      </nav>
      <div class="side-footer">Corrosion Protection<br>Monitoring System</div>
    `;
    sidebar.setAttribute("aria-label", "Primary navigation");
  }

  let overlay = document.getElementById("sidebarOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sidebarOverlay";
    overlay.className = "sidebar-overlay";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);
  }

  if (topbar) {
    topbar.innerHTML = `
      <div class="topbar-title">
        <button class="icon-button mobile-menu-button" type="button" id="sidebarToggle"
          aria-label="Collapse sidebar" aria-controls="primarySidebar" aria-expanded="false">${icon("fa-bars")}</button>
        <strong>${getPageTitle(page)}</strong>
      </div>
      <div class="topbar-actions">
        <span class="role">${displayRole}</span>
        <div class="notification-shell">
          <button class="icon-button notification-button" type="button" id="notificationButton"
            aria-label="Notifications" aria-expanded="false" aria-controls="notificationPopover">${icon("fa-bell")}</button>
          <div class="notification-popover" id="notificationPopover" role="dialog" aria-labelledby="notificationPopoverTitle" hidden>
            <div class="notification-popover-header">
              <strong id="notificationPopoverTitle">Notifications</strong>
            </div>
            <div class="notification-popover-body" id="notificationPopoverBody">
              <p>No new notifications</p>
              <span>You are all caught up.</span>
            </div>
          </div>
        </div>
<div class="profile-menu">
  <button
    type="button"
    class="avatar profile-button"
    id="profileButton"
    aria-expanded="false">
    ${escapeCommonHtml(initials)}
  </button>

  <div class="profile-dropdown" id="profileDropdown" hidden>
    <div class="profile-info">
      <strong>${escapeCommonHtml(fullName || "User")}</strong><br>
      <small>${displayRole}</small>
    </div>

    <button
      type="button"
      class="profile-dropdown-item"
      id="logoutButton">
      Logout
    </button>
  </div>
</div>
      </div>
    `;
  }

const profileButton = document.getElementById("profileButton");
const profileDropdown = document.getElementById("profileDropdown");
const logoutButton = document.getElementById("logoutButton");

if (profileButton && profileDropdown) {

  profileButton.onclick = (event) => {
    event.stopPropagation();

    profileDropdown.hidden = !profileDropdown.hidden;

    profileButton.setAttribute(
      "aria-expanded",
      String(!profileDropdown.hidden)
    );
  };

logoutButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  logout();
});

document.addEventListener("click", (event) => {
  if (
    !profileButton.contains(event.target) &&
    !profileDropdown.contains(event.target)
  ) {
    profileDropdown.hidden = true;
    profileButton.setAttribute("aria-expanded", "false");
  }
});
}

  if (sidebar) sidebar.id = "primarySidebar";
  bindResponsiveNavigation();
  handleViewportChange();
  window.AppNotifications?.init?.();
  window.AppNavigation?.updateActiveNavigation?.();
}

async function endAuthenticatedSession({ scope = "local", redirect = true } = {}) {
  window.__cpmSigningOut = true;
  if (window.appSupabase) {
    const { error } = await window.appSupabase.auth.signOut({ scope });
    if (error) throw error;
  }

  await clearServerSession();
  clearLocalUserCache();
  window.AppAuthStorage?.clearAuthSession?.();
  if (redirect) location.replace("index.php");
}

async function logout(options = {}) {
  try {
    await endAuthenticatedSession({ scope: options.scope || "local" });
  } catch (error) {
    console.error("Sign out failed:", error);
    notifyUser(error.message || "Unable to sign out. Please try again.", "error");
  }
}

async function clearServerSession() {
  try {
    await fetch("php/clear-session.php", {
      method: "POST",
      headers: { "X-CPM-Request": "1" },
      credentials: "same-origin",
    });
  } catch (error) {
    console.warn("Failed to clear server-side session:", error);
  }
}

function clearLocalUserCache() {
  localStorage.removeItem("userRole");
  localStorage.removeItem("userIsSuperAdmin");
  localStorage.removeItem("userFullName");
  localStorage.removeItem("userInitials");
  window.AppPreferences?.setCurrentUserId?.("");
}

async function redirectToLogin(expired = false) {
  clearLocalUserCache();
  window.AppAuthStorage?.clearAuthSession?.();
  await clearServerSession();
  location.replace(expired ? "index.php?expired=1" : "index.php");
}

let serverSessionSyncBound = false;

// Keeps the PHP session in step with Supabase (#48).
function bindServerSessionSync() {
  if (serverSessionSyncBound || !window.appSupabase) return;
  serverSessionSyncBound = true;

  window.appSupabase.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED" && session?.access_token) {
      // Keep the server's copy of the token fresh. The server re-verifies it.
      fetch("php/set-session.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CPM-Request": "1" },
        credentials: "same-origin",
        body: JSON.stringify({ mode: "refresh", access_token: session.access_token }),
      })
        .then((response) => {
          // 401/403: the server ended the session (deactivated, expired).
          if (response.status === 401 || response.status === 403) return redirectToLogin(true);
        })
        .catch((error) => console.warn("Session refresh sync failed:", error));
    } else if (event === "SIGNED_OUT" && !window.__cpmSigningOut) {
      // Signed out in another tab, or Supabase could not refresh the token.
      redirectToLogin(true);
    }
  });
}

async function refreshAuthenticatedProfile() {
  const profile = await new window.AppRepositories.UserRepository().getCurrentUserProfile();
  if (!profile?.isActive) {
    await window.appSupabase.auth.signOut({ scope: "local" });
    clearLocalUserCache();
    throw new Error("Your account is inactive.");
  }
  window.AppPreferences?.setCurrentUserId?.(profile.id);
  localStorage.setItem("userRole", profile.role);
  localStorage.setItem("userIsSuperAdmin", String(Boolean(profile.isSuperAdmin)));
  localStorage.setItem("userFullName", profile.fullName || "");
  localStorage.setItem("userInitials", getInitials(profile.fullName || profile.email));
  buildLayout();
  return profile;
}

async function autoGuard() {
  const page = location.pathname.split("/").pop();

  buildLayout();

  if (publicPages.includes(page)) return;
  if (!authGuardEnabled) return;
  if (!window.appSupabase) return;
  if (!window.AppRepositories?.UserRepository) {
    console.warn("Repository layer is not loaded; authentication guard cannot load profiles.");
    return;
  }

  try {
    const {
      data: { session },
    } = await window.appSupabase.auth.getSession();

    if (!session) {
      // Remember Me off keeps the Supabase session in sessionStorage, which
      // is per tab (#47). A new tab therefore has no session even though the
      // PHP session is valid. Ask for sign-in in this tab only, without
      // destroying the PHP session that the user's other tabs rely on.
      clearLocalUserCache();
      location.replace("index.php?signin=tab");
      return;
    }

    bindServerSessionSync();

    const profile = await refreshAuthenticatedProfile();
    const role = profile.role;
    if (adminPages.includes(page) && role !== "admin") {
      location.href = "dashboard.php";
    }
  } catch (error) {
    console.warn("Failed to initialize layout guard:", error);
    if (!publicPages.includes(page)) {
      alert(error.message || "Unable to verify your session.");
      await redirectToLogin();
    }
  }
}

function openModal(id) {
  document.getElementById(id)?.classList.add("show");
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("show");
}

function notifyUser(message, type = "info") {
  const toast = window.AppToast?.[type] || window.AppToast?.show;
  if (toast) {
    toast(message, { type });
    return;
  }
  alert(message);
}

window.buildLayout = buildLayout;
window.autoGuard = autoGuard;
window.logout = logout;
window.AppSession = {
  signOut: endAuthenticatedSession,
  clearServerSession,
  clearLocalUserCache,
};
window.refreshAuthenticatedProfile = refreshAuthenticatedProfile;
window.openModal = openModal;
window.closeModal = closeModal;
window.notifyUser = notifyUser;
window.openMobileNavigation = openMobileNavigation;
window.closeMobileNavigation = closeMobileNavigation;
window.getCurrentPageName = getCurrentPageName;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoGuard);
} else {
  autoGuard();
}

window.addEventListener("load", () => {
  buildLayout();
});

document.addEventListener("click", (event) => {
  const navTarget = event.target.closest("[data-nav]");
  if (navTarget) {
    event.preventDefault();
    if (window.AppNavigation?.navigateToPage) {
      window.AppNavigation.navigateToPage(navTarget.dataset.nav);
    } else {
      location.href = navTarget.dataset.nav;
    }
    return;
  }

  const printTarget = event.target.closest("[data-print]");
  if (printTarget) window.print();
});
