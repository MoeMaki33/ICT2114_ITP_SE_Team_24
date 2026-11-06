const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const seed = fs.readFileSync(path.join(root, "supabase/seeds/weekly_summary_demo_seed.sql"), "utf8");
const cleanup = fs.readFileSync(path.join(root, "supabase/data/weekly_summary_cleanup.sql"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "supabase/data/weekly_summary_cleanup_manifest.json"), "utf8"));

test("seed is transactional, tagged, deterministic and summary-pipeline based", () => {
  assert.match(seed, /^--[\s\S]*\bbegin;/i);
  assert.match(seed, /commit;\s*$/i);
  assert.match(seed, /synthetic_weekly_summary_demo_v1/g);
  assert.match(seed, /pg_temp\.weekly_demo_uuid/);
  assert.match(seed, /delete from public\.reading_batches\s+where source_file = 'synthetic_weekly_summary_demo_v1'/i);
  assert.doesNotMatch(seed, /delete from public\.test_point_readings/i);
  assert.doesNotMatch(seed, /insert into public\.(daily_summaries|weekly_summaries)/i);
  assert.match(seed, /refresh_daily_summary/);
  assert.match(seed, /refresh_weekly_summary/);
  assert.match(seed, /v_reading_count <> 588/);
  assert.match(seed, /v_comparison_count <> 336/);
  assert.match(seed, /v_selected_count <> 252/);
  assert.match(seed, /reading_ts > now\(\)/);
});

test("cleanup uses the explicit manifest and never deletes dependent history", () => {
  assert.equal(manifest.testPointsToDeactivate.length, 19);
  assert.equal(manifest.historicalJalanBanPreservationBaseline.length, 4);
  assert.equal(manifest.historicalJalanBanPreservationBaseline.every((point) => point.dependentReadingCount === 3033), true);
  manifest.testPointsToDeactivate.forEach((point) => assert.match(cleanup, new RegExp(point.id, "i")));
  manifest.historicalJalanBanPreservationBaseline.forEach((point) => assert.match(cleanup, new RegExp(point.id, "i")));
  assert.doesNotMatch(cleanup, /delete\s+from/i);
  assert.doesNotMatch(cleanup, /label\s+(like|ilike)/i);
  assert.match(cleanup, /v_total < 12132/);
});

test("seed defines unique codes and does not insert after 18 July 2026", () => {
  const codes = [...seed.matchAll(/'(JBN|JBS|PAN|DTW)-TP-\d{3}'/g)].map((match) => match[0]);
  const uniqueCodes = new Set(codes);
  [
    "'JBN-TP-001'", "'JBN-TP-002'", "'JBN-TP-003'", "'JBN-TP-004'",
    "'JBS-TP-001'", "'JBS-TP-002'", "'JBS-TP-003'", "'JBS-TP-004'",
    "'PAN-TP-001'", "'PAN-TP-002'", "'PAN-TP-003'", "'PAN-TP-004'",
    "'DTW-TP-001'", "'DTW-TP-002'", "'DTW-TP-003'", "'DTW-TP-004'",
  ].forEach((code) => assert.equal(uniqueCodes.has(code), true, `${code} must be present`));
  assert.match(seed, /generate_series\('2026-07-13'::date, '2026-07-18'::date/);
  assert.doesNotMatch(seed, /2026-07-(2[0-9]|3[01]).*reading/i);
});
