const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
global.AppStatus = {
  DEFAULT_PROTECTION_THRESHOLD_MV: -850,
  deriveProtectionStatus: () => ({ displayStatus: "Unknown" }),
};
require("../www/js/repositories/supabase-repositories.js");

test("daily RPC failure remains distinguishable from a valid empty result", async () => {
  const repository = new window.AppRepositories.WeeklySummaryRepository();
  const permissionError = Object.assign(new Error("permission denied for table daily_summaries"), { code: "42501" });
  repository.getWeeklySummaries = async () => [{ testPointUuid: "point-a" }];
  repository.getDailySummaries = async () => { throw permissionError; };
  repository.compareWeeks = async () => [];

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await repository.getWeeklySummaryData("2026-07-13", "2026-07-06");
    assert.equal(result.weeklySummaries.length, 1);
    assert.deepEqual(result.dailySummaries, []);
    assert.equal(result.dailySummariesError, permissionError);
  } finally {
    console.error = originalConsoleError;
  }
});

test("valid empty daily result has no error", async () => {
  const repository = new window.AppRepositories.WeeklySummaryRepository();
  const requestedIds = [];
  repository.getWeeklySummaries = async () => [{ testPointUuid: "active-point-a" }, { testPointUuid: "active-point-b" }];
  repository.getDailySummaries = async (_week, ids) => {
    requestedIds.push(...ids);
    return [];
  };
  repository.compareWeeks = async () => [];
  const result = await repository.getWeeklySummaryData("2026-07-13", null);
  assert.deepEqual(result.dailySummaries, []);
  assert.equal(result.dailySummariesError, null);
  assert.deepEqual(requestedIds, ["active-point-a", "active-point-b"], "daily RPC is scoped to the same active UUID set as the weekly RPC");
});
