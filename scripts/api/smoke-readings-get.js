#!/usr/bin/env node
/**
 * Post-deployment smoke test for the Readings API GET contract (docs/week9/readings-api.md).
 * READ-ONLY: it never writes a reading. The POST checks use requests that the existing
 * contract rejects before any database call (wrong method / wrong media type).
 *
 *   node scripts/api/smoke-readings-get.js                 # looks up the newest reading
 *   node scripts/api/smoke-readings-get.js <reading_ts>    # or check a known timestamp
 *
 * Settings come from the untracked root .env (or the shell environment):
 *   CPM_API_BASE             https://<deployment>   (origin only, no path; HTTPS)
 *   SUPABASE_URL             the project that deployment uses
 *   SUPABASE_PUBLISHABLE_KEY publishable key of that project
 *   CPM_SMOKE_EMAIL / CPM_SMOKE_PASSWORD   an active engineer or admin (never commit these)
 * Prints status codes and X-Request-Id values only; never tokens or credentials.
 */
require("dotenv").config({ path: require("node:path").join(__dirname, "..", "..", ".env") });
const { createClient } = require("@supabase/supabase-js");

const env = process.env;
for (const key of ["CPM_API_BASE", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "CPM_SMOKE_EMAIL", "CPM_SMOKE_PASSWORD"]) {
  if (!env[key]) { console.error(`Missing ${key}`); process.exit(1); }
}
const origin = new URL(env.CPM_API_BASE).origin;
if (!origin.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin)) {
  console.error("CPM_API_BASE must use HTTPS."); process.exit(1);
}

async function main() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({ email: env.CPM_SMOKE_EMAIL, password: env.CPM_SMOKE_PASSWORD });
  if (signInError || !session.session) { console.error(`Sign-in failed: ${signInError?.message || "no session"}`); process.exit(1); }
  const token = session.session.access_token;

  let stored = process.argv[2];
  let expected = null;
  if (!stored) {
    const { data, error } = await supabase.from("test_point_readings")
      .select("test_point_id, value_mv, reading_batches!inner(reading_ts)").order("created_at", { ascending: false }).limit(1);
    if (error) { console.error(`Lookup failed: ${error.message}`); process.exit(1); }
    if (!data.length) { console.error("No readings to look up; pass a reading_ts."); process.exit(1); }
    stored = data[0].reading_batches.reading_ts;
    expected = { testPointId: data[0].test_point_id, value: data[0].value_mv };
  }
  const ts = encodeURIComponent(stored);
  const rows = [];
  let failures = 0;
  const check = async (name, path, options, verify) => {
    const response = await fetch(`${origin}${path}`, { redirect: "manual", ...options });
    const text = await response.text();
    let ok = false;
    try { ok = verify(response, text); } catch { ok = false; }
    if (!ok) failures++;
    rows.push(`${ok ? "PASS" : "FAIL"}  ${String(response.status).padEnd(4)} ${name.padEnd(52)} ${response.headers.get("x-request-id") || "-"}`);
    return text;
  };
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const json = (text) => JSON.parse(text);
  const isArray = (r, t) => r.status === 200 && Array.isArray(json(t)) && !r.headers.get("location");

  const v1 = await check("GET v1 known timestamp (field=potential)", `/api/v1/readings/?timestamp=${ts}&field=potential`, auth, (r, t) =>
    isArray(r, t) && json(t).every((i) => typeof i.timestamp === "string" && typeof i.value === "number")
      && (!expected || json(t).some((i) => i.testPointId === expected.testPointId && i.value === expected.value)));
  await check("GET /api/readings same body, no redirect", `/api/readings?timestamp=${ts}&field=potential`, auth, (r, t) => isArray(r, t) && t === v1);
  await check("GET /api/readings/ same body, no redirect", `/api/readings/?timestamp=${ts}&field=potential`, auth, (r, t) => isArray(r, t) && t === v1);
  await check("GET limit=1 (paging)", `/api/readings?timestamp=${ts}&field=potential&limit=1`, auth, (r, t) =>
    isArray(r, t) && json(t).length === Math.min(1, json(v1).length) && (r.headers.get("link") !== null) === (json(v1).length > 1));
  await check("GET missing field -> 400", `/api/readings?timestamp=${ts}`, auth, (r, t) => r.status === 400 && json(t).message === "Invalid or missing field");
  await check("GET missing timestamp -> 400 exact client body", "/api/readings?field=potential", auth, (r, t) => r.status === 400 && t === '{"message":"Invalid or missing timestamp"}');
  await check("GET no token -> 401", `/api/readings?timestamp=${ts}&field=potential`, {}, (r) => r.status === 401);
  await check("GET bad token -> 401", `/api/v1/readings/?timestamp=${ts}&field=potential`, { headers: { Authorization: "Bearer not-a-real-token" } }, (r) => r.status === 401);
  await check("POST on /api/readings alias -> 405 Allow: GET", "/api/readings", { method: "POST", headers: { ...auth.headers, "Content-Type": "application/json" }, body: "{}" },
    (r) => r.status === 405 && r.headers.get("allow") === "GET");
  await check("PUT on v1 -> 405 Allow: GET, POST", "/api/v1/readings/", { method: "PUT", ...auth }, (r) => r.status === 405 && r.headers.get("allow") === "GET, POST");
  // Existing POST contract, no write: either ingestion is off (503) or the media type is refused (415).
  await check("POST v1 contract (text/plain, never writes)", "/api/v1/readings/", { method: "POST", headers: { ...auth.headers, "Content-Type": "text/plain" }, body: "x" },
    (r, t) => (r.status === 503 && ["ingestion_disabled", "ingestion_misconfigured"].includes(json(t).error)) || (r.status === 415 && json(t).error === "json_required"));
  await supabase.auth.signOut();

  console.log(`\nReadings GET smoke test against ${origin} (timestamp ${stored})\n`);
  console.log(rows.join("\n"));
  console.log(`\n${rows.length - failures}/${rows.length} passed.`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => { console.error(`Smoke test error: ${error.message}`); process.exit(1); });
