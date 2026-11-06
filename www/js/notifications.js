(function () {
  class NotificationRepository {
    async getUnreadCount() {
      return 0;
    }

    async getNotifications() {
      return [];
    }

    async markAsRead() {}
  }

  const state = {
    repository: new NotificationRepository(),
    notifications: [],
    unreadCount: 0,
    bound: false,
  };

  function formatCount(count) {
    return count > 9 ? "9+" : String(count);
  }

  function renderPopover() {
    const button = document.getElementById("notificationButton");
    const body = document.getElementById("notificationPopoverBody");
    if (!button || !body) return;

    button.classList.toggle("has-unread", state.unreadCount > 0);
    button.dataset.unreadCount = state.unreadCount > 0 ? formatCount(state.unreadCount) : "";
    button.setAttribute(
      "aria-label",
      state.unreadCount > 0 ? `Notifications, ${state.unreadCount} unread` : "Notifications"
    );

    body.replaceChildren();
    if (!state.notifications.length) {
      const title = document.createElement("p");
      title.textContent = "No new notifications";
      const message = document.createElement("span");
      message.textContent = "You are all caught up.";
      body.append(title, message);
      return;
    }
    state.notifications.forEach((item) => {
      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = `notification-item ${item.read ? "" : "unread"}`;
      entry.dataset.notificationId = String(item.id);
      const title = document.createElement("strong");
      title.textContent = item.title || "Notification";
      const message = document.createElement("span");
      message.textContent = item.message || "";
      entry.append(title, message);
      body.append(entry);
    });
  }

  function openPopover() {
    const button = document.getElementById("notificationButton");
    const popover = document.getElementById("notificationPopover");
    if (!button || !popover) return;
    popover.hidden = false;
    button.setAttribute("aria-expanded", "true");
  }

  function closePopover({ restoreFocus = false } = {}) {
    const button = document.getElementById("notificationButton");
    const popover = document.getElementById("notificationPopover");
    if (!button || !popover) return;
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus();
  }

  function togglePopover() {
    const popover = document.getElementById("notificationPopover");
    if (!popover) return;
    if (popover.hidden) openPopover();
    else closePopover();
  }

  async function refresh() {
    try {
      state.unreadCount = await state.repository.getUnreadCount();
      state.notifications = await state.repository.getNotifications();
    } catch (error) {
      console.warn("Unable to load notifications:", error);
      state.unreadCount = 0;
      state.notifications = [];
    }
    renderPopover();
  }

  function bindGlobalEvents() {
    if (state.bound) return;
    state.bound = true;
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("#notificationButton");
      if (button) {
        event.preventDefault();
        togglePopover();
        return;
      }

      const item = event.target.closest("[data-notification-id]");
      if (item) {
        await state.repository.markAsRead(item.dataset.notificationId);
        await refresh();
        return;
      }

      if (!event.target.closest(".notification-shell")) closePopover();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePopover({ restoreFocus: true });
    });
  }

  function init(repository = state.repository) {
    state.repository = repository;
    bindGlobalEvents();
    refresh();
  }

  window.AppNotifications = {
    NotificationRepository,
    init,
    refresh,
    closePopover,
  };
})();
