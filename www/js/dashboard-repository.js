(function () {
  class DashboardRepository {
    async getDashboardLayout() {
      throw new Error("getDashboardLayout() must be implemented.");
    }

    async saveDashboardLayout() {
      throw new Error("saveDashboardLayout() must be implemented.");
    }

    async resetDashboardLayout() {
      throw new Error("resetDashboardLayout() must be implemented.");
    }
  }

  class ApiDashboardRepository extends DashboardRepository {
    constructor(baseUrl = "/api/dashboard/layout") {
      super();
      this.baseUrl = baseUrl;
    }

    async request(method, body) {
      const response = await fetch(this.baseUrl, {
        method,
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(`Dashboard API returned ${response.status}.`);
      return response.status === 204 ? null : response.json();
    }

    async getDashboardLayout() {
      const record = await this.request("GET");
      return record?.layoutConfig || record || null;
    }

    async saveDashboardLayout(layout) {
      return this.request("PUT", {
        layoutVersion: layout.version,
        columns: layout.columns,
        metricOrder: layout.metricOrder,
        widgets: layout.widgets,
      });
    }

    async resetDashboardLayout() {
      return this.request("DELETE");
    }
  }

  class SupabaseDashboardRepository extends DashboardRepository {
    constructor(pageKey = "main-dashboard") {
      super();
      this.pageKey = pageKey;
      this.repository = new window.AppRepositories.DashboardLayoutRepository();
    }

    async getDashboardLayout() {
      const record = await this.repository.getLayout(this.pageKey);
      return record?.layoutConfig || null;
    }

    async saveDashboardLayout(layout) {
      return this.repository.saveLayout(DashboardLayout.cloneLayout(layout), this.pageKey);
    }

    async resetDashboardLayout() {
      return this.repository.resetLayout(this.pageKey);
    }
  }

  async function createDashboardRepository() {
    if (window.DASHBOARD_API_ENABLED === true) return new ApiDashboardRepository();
    if (!window.AppRepositories?.DashboardLayoutRepository) {
      throw new Error("Supabase dashboard repository is not available.");
    }
    return new SupabaseDashboardRepository();
  }

  window.DashboardRepositories = {
    DashboardRepository,
    ApiDashboardRepository,
    SupabaseDashboardRepository,
    createDashboardRepository,
  };
})();
