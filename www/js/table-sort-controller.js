(function () {
  const INDICATORS = {
    unsorted: "↕",
    asc: "↑",
    desc: "↓",
  };

  class TableSortController {
    constructor({ root, initialKey = "", initialDirection = null, onSortChanged = null } = {}) {
      this.root = root || null;
      this.sortKey = initialKey || "";
      this.sortDirection = this.sortKey && initialDirection === "desc" ? "desc" : this.sortKey ? "asc" : null;
      this.onSortChanged = onSortChanged;
      this.abortController = new AbortController();

      this.root?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-table-sort-button]");
        if (!button || !this.root.contains(button)) return;
        this.setSort(button.dataset.tableSortButton);
      }, { signal: this.abortController.signal });

      this.updateIndicators();
    }

    setSort(key) {
      if (!key) return;
      this.sortDirection = this.sortKey === key && this.sortDirection === "asc" ? "desc" : "asc";
      this.sortKey = key;
      this.updateIndicators();
      this.onSortChanged?.({ key: this.sortKey, direction: this.sortDirection });
    }

    updateIndicators() {
      this.root?.querySelectorAll("[data-table-sort-key]").forEach((header) => {
        const key = header.dataset.tableSortKey;
        const label = header.dataset.tableSortLabel || header.textContent.trim();
        const active = key === this.sortKey && Boolean(this.sortDirection);
        const directionLabel = this.sortDirection === "desc" ? "descending" : "ascending";
        const nextDirection = this.sortDirection === "asc" ? "descending" : "ascending";
        const accessibleLabel = active
          ? `Sorted ${directionLabel} by ${label}. Activate to sort ${nextDirection}.`
          : `Sort by ${label}`;

        header.dataset.tableSortLabel = label;
        header.setAttribute("aria-sort", active ? directionLabel : "none");
        header.innerHTML = `
          <button
            type="button"
            class="table-sort-button"
            data-table-sort-button="${escapeAttribute(key)}"
            aria-label="${escapeAttribute(accessibleLabel)}"
            title="${escapeAttribute(accessibleLabel)}"
          >
            <span>${escapeHtml(label)}</span>
            <span class="sort-indicator" aria-hidden="true">${active ? INDICATORS[this.sortDirection] : INDICATORS.unsorted}</span>
          </button>`;
      });
    }

    destroy() {
      this.abortController.abort();
      this.root = null;
      this.onSortChanged = null;
    }
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

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  window.TableSortController = TableSortController;
})();
