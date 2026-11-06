/**
 * Staging integration tests for the Super Admin rules and the Readings API RPC.
 * Run only with RUN_DB_TESTS=1 against STAGING (refuses the live project):
 *
 *   bash:        RUN_DB_TESTS=1 npm run test:db
 *   PowerShell:  $env:RUN_DB_TESTS=1; npm run test:db
 *
 * Signs in as real staging users and goes through the same paths as the app:
 * RLS + guard trigger, the manage-users Edge Function, the audit log and the
 * ingest_reading_v1 RPC. Creates two
 * temporary accounts and deletes them at the end; the readings checks are all
 * rejections, so no readings are written.
 *
 * Root .env (untracked):
 *   STAGING_SUPABASE_URL, STAGING_SUPABASE_PUBLISHABLE_KEY
 *   STAGING_SUPER_ADMIN_EMAIL / STAGING_SUPER_ADMIN_PASSWORD   the one Super Admin
 *   STAGING_ADMIN_EMAIL / STAGING_ADMIN_PASSWORD               an active plain admin
 *   STAGING_STATIONARY_TEST_POINT_ID   optional: an active stationary point
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const LIVE_PROJECT_REF = "pscwapylbjvulvsszdur";
const env = process.env;
const enabled = env.RUN_DB_TESTS === "1";
const skip = enabled ? false : "set RUN_DB_TESTS=1 to run staging integration tests";

function staging() {
  for (const key of ["STAGING_SUPABASE_URL", "STAGING_SUPABASE_PUBLISHABLE_KEY", "STAGING_SUPER_ADMIN_EMAIL",
    "STAGING_SUPER_ADMIN_PASSWORD", "STAGING_ADMIN_EMAIL", "STAGING_ADMIN_PASSWORD"]) {
    if (!env[key]) throw new Error(`Missing ${key} in .env`);
  }
  if (env.STAGING_SUPABASE_URL.includes(LIVE_PROJECT_REF)) {
    throw new Error("STAGING_SUPABASE_URL points at the LIVE project. Refusing to run.");
  }
  return { url: env.STAGING_SUPABASE_URL, key: env.STAGING_SUPABASE_PUBLISHABLE_KEY };
}

function client() {
  const { createClient } = require("@supabase/supabase-js");
  const { url, key } = staging();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return { supabase, id: data.user.id };
}

/** manage-users call; resolves to the HTTP status. */
async function manageUsers(caller, body) {
  const { error } = await caller.supabase.functions.invoke("manage-users", { body });
  if (!error) return 200;
  return error.context?.status ?? 0;
}

async function profile(reader, id) {
  const { data, error } = await reader.supabase.from("users")
    .select("id, role, is_active, is_super_admin").eq("id", id).single();
  if (error) throw error;
  return data;
}

test("Super Admin rules hold on staging (RLS, guard trigger, manage-users, audit)", { skip }, async (t) => {
  const superAdmin = await signIn(env.STAGING_SUPER_ADMIN_EMAIL, env.STAGING_SUPER_ADMIN_PASSWORD);
  const admin = await signIn(env.STAGING_ADMIN_EMAIL, env.STAGING_ADMIN_PASSWORD);
  const stamp = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const password = () => `${crypto.randomBytes(12).toString("base64url")}1a`;
  const temp = {
    engineer: { email: `cpm-dbtest-eng-${stamp}@example.com`, role: "corrosion_engineer", password: password() },
    admin: { email: `cpm-dbtest-adm-${stamp}@example.com`, role: "admin", password: password() },
  };

  t.after(async () => {
    for (const account of Object.values(temp)) {
      if (account.id) await manageUsers(superAdmin, { action: "delete", id: account.id });
    }
    await superAdmin.supabase.auth.signOut();
    await admin.supabase.auth.signOut();
  });

  async function lookupId(email) {
    const { data, error } = await superAdmin.supabase.from("users").select("id").eq("email", email).single();
    assert.ifError(error);
    return data.id;
  }

  async function auditRows(userId) {
    const { data, error } = await superAdmin.supabase.from("user_account_changes")
      .select("action, changed_by, old_role, new_role, old_is_active, new_is_active, old_is_super_admin, new_is_super_admin")
      .eq("user_id", userId).order("id");
    assert.ifError(error);
    return data;
  }

  await t.test("fixture accounts are what the test expects", async () => {
    const sa = await profile(superAdmin, superAdmin.id);
    assert.equal(sa.role, "admin");
    assert.equal(sa.is_super_admin, true, "STAGING_SUPER_ADMIN must have is_super_admin = true");
    const plain = await profile(admin, admin.id);
    assert.equal(plain.role, "admin");
    assert.equal(plain.is_super_admin, false, "STAGING_ADMIN must be a plain admin");
  });

  await t.test("a plain admin creates engineers but not Admins", async () => {
    assert.equal(await manageUsers(admin, { action: "create", name: "Should Fail", email: `cpm-dbtest-no-${stamp}@example.com`, password: password(), role: "admin" }), 403);
    const e = temp.engineer;
    assert.equal(await manageUsers(admin, { action: "create", name: "DB test engineer", email: e.email, password: e.password, role: e.role }), 200);
    e.id = await lookupId(e.email);
  });

  await t.test("the Super Admin creates Admins", async () => {
    const a = temp.admin;
    assert.equal(await manageUsers(superAdmin, { action: "create", name: "DB test admin", email: a.email, password: a.password, role: a.role }), 200);
    a.id = await lookupId(a.email);
  });

  await t.test("R12: the browser cannot write to users directly, even as an admin", async () => {
    await admin.supabase.from("users").update({ is_active: false }).eq("id", temp.engineer.id);
    await admin.supabase.from("users").update({ role: "corrosion_engineer" }).eq("id", admin.id);
    await superAdmin.supabase.from("users").update({ is_active: false }).eq("id", temp.admin.id);
    assert.equal((await profile(superAdmin, temp.engineer.id)).is_active, true);
    assert.equal((await profile(superAdmin, admin.id)).role, "admin");
    assert.equal((await profile(superAdmin, temp.admin.id)).is_active, true);
    const { error } = await admin.supabase.from("users").insert({ id: crypto.randomUUID(), full_name: "x", email: `cpm-dbtest-x-${stamp}@example.com`, role: "admin" });
    assert.ok(error, "direct insert refused");
  });

  await t.test("a plain admin manages engineers through manage-users", async () => {
    assert.equal(await manageUsers(admin, { action: "update", id: temp.engineer.id, is_active: false }), 200);
    assert.equal((await profile(superAdmin, temp.engineer.id)).is_active, false);
    assert.equal(await manageUsers(admin, { action: "update", id: temp.engineer.id, is_active: true }), 200);
    assert.equal(await manageUsers(admin, { action: "update", id: temp.engineer.id, name: "Renamed by admin" }), 200);
  });

  await t.test("a plain admin cannot manage Admins or the Super Admin", async () => {
    assert.equal(await manageUsers(admin, { action: "update", id: temp.admin.id, is_active: false }), 403);
    assert.equal(await manageUsers(admin, { action: "update", id: temp.engineer.id, role: "admin" }), 403);
    assert.equal(await manageUsers(admin, { action: "delete", id: temp.admin.id }), 403);
    assert.equal(await manageUsers(admin, { action: "update", id: superAdmin.id, name: "Changed" }), 403);
  });

  await t.test("the Super Admin cannot be deactivated, demoted or deleted", async () => {
    assert.equal(await manageUsers(superAdmin, { action: "update", id: superAdmin.id, is_active: false }), 403);
    assert.equal(await manageUsers(superAdmin, { action: "update", id: superAdmin.id, role: "corrosion_engineer" }), 403);
    assert.equal(await manageUsers(superAdmin, { action: "delete", id: superAdmin.id }), 403);
    assert.equal((await profile(superAdmin, superAdmin.id)).is_super_admin, true);
  });

  await t.test("the Super Admin promotes and demotes", async () => {
    assert.equal(await manageUsers(superAdmin, { action: "update", id: temp.engineer.id, role: "admin" }), 200);
    assert.equal((await profile(superAdmin, temp.engineer.id)).role, "admin");
    assert.equal(await manageUsers(superAdmin, { action: "update", id: temp.engineer.id, role: "corrosion_engineer" }), 200);
  });

  await t.test("every account change is logged with who made it", async () => {
    const engineerLog = await auditRows(temp.engineer.id);
    assert.equal(engineerLog[0].action, "created");
    assert.equal(engineerLog[0].changed_by, admin.id);
    assert.ok(engineerLog.some((row) => row.old_is_active === true && row.new_is_active === false && row.changed_by === admin.id));
    assert.ok(engineerLog.some((row) => row.new_role === "admin" && row.changed_by === superAdmin.id));
    const adminLog = await auditRows(temp.admin.id);
    assert.equal(adminLog[0].action, "created");
    assert.equal(adminLog[0].changed_by, superAdmin.id);
  });

  await t.test("deletes: admins delete engineers, the Super Admin deletes Admins; both logged", async () => {
    assert.equal(await manageUsers(admin, { action: "delete", id: temp.engineer.id }), 200);
    assert.equal(await manageUsers(superAdmin, { action: "delete", id: temp.admin.id }), 200);
    for (const [account, deleter] of [[temp.engineer, admin], [temp.admin, superAdmin]]) {
      const { data } = await superAdmin.supabase.from("users").select("id").eq("id", account.id);
      assert.equal(data.length, 0);
      const deleted = (await auditRows(account.id)).find((row) => row.action === "deleted");
      assert.equal(deleted?.changed_by, deleter.id);
      account.id = null;
    }
  });
});

test("Readings API RPC rejects bad input on staging (no writes)", { skip }, async (t) => {
  const admin = await signIn(env.STAGING_ADMIN_EMAIL, env.STAGING_ADMIN_PASSWORD);
  t.after(() => admin.supabase.auth.signOut());
  const point = env.STAGING_STATIONARY_TEST_POINT_ID || "00000000-0000-4000-8000-000000000001";
  const base = { test_point_id: point, reading_ts: new Date().toISOString(), value_mv: -850 };
  const rpc = (reading, caller = admin.supabase) => caller.rpc("ingest_reading_v1", { p_reading: reading });

  await t.test("anon cannot execute ingest_reading_v1", async () => {
    const { error } = await rpc(base, client());
    assert.ok(error, "anon call must fail");
    assert.equal(error.code, "42501");
  });

  for (const [name, reading] of [
    ["future timestamp", { ...base, reading_ts: "2099-01-01T00:00:00Z" }],
    ["pre-2000 timestamp", { ...base, reading_ts: "1999-01-01T00:00:00Z" }],
    ["implausible potential", { ...base, value_mv: 9000 }],
    ["power sent by the client", { ...base, power_watts: 10 }],
    ["offset past +14:00", { ...base, reading_ts: "2026-10-24T12:00:00+14:30" }],
  ]) {
    await t.test(`rejects ${name}`, async () => {
      const { error } = await rpc(reading);
      assert.equal(error?.code, "22023", JSON.stringify(error));
    });
  }

  await t.test("rejects current/voltage on a stationary point", { skip: env.STAGING_STATIONARY_TEST_POINT_ID ? false : "set STAGING_STATIONARY_TEST_POINT_ID" }, async () => {
    const { error } = await rpc({ ...base, reading_ts: "2026-01-01T00:00:00Z", current_a: 10, voltage_v: 24 });
    assert.equal(error?.code, "22023", JSON.stringify(error));
  });
});

/** Stored timestamptz text from PostgREST => the API's UTC "Z" form (fraction kept, trailing zeros dropped). */
function apiTimestamp(stored) {
  const m = stored.match(/^(.+?T\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)$/);
  const utc = new Date(`${m[1]}${m[3] === "Z" ? "Z" : m[3]}`).toISOString().slice(0, 19);
  const fraction = (m[2] || "").replace(/0+$/, "");
  return `${utc}${fraction ? `.${fraction}` : ""}Z`;
}

/** The same instant written with a +08:00 offset, keeping any fractional seconds. */
function singaporeTimestamp(stored) {
  const m = stored.match(/^(.+?T\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)$/);
  const local = new Date(new Date(`${m[1]}${m[3]}`).getTime() + 8 * 3600000).toISOString().slice(0, 19);
  return `${local}${m[2] ? `.${m[2]}` : ""}+08:00`;
}

test("Readings GET API returns real staging readings (read-only)", { skip }, async (t) => {
  const fs = require("node:fs");
  const http = require("node:http");
  const { spawn, spawnSync } = require("node:child_process");
  const php = env.PHP_BINARY || (process.platform === "win32" && fs.existsSync("C:/xampp/php/php.exe") ? "C:/xampp/php/php.exe" : "php");
  if (spawnSync(php, ["--version"]).error) throw new Error("PHP 8.1+ is required for the GET staging test (set PHP_BINARY)");
  const admin = await signIn(env.STAGING_ADMIN_EMAIL, env.STAGING_ADMIN_PASSWORD);
  const token = (await admin.supabase.auth.getSession()).data.session.access_token;
  t.after(() => admin.supabase.auth.signOut());
  const { url, key } = staging();

  // An existing reading to look up; prefer one whose batch recorded a voltage.
  const select = "id, test_point_id, value_mv, reading_batches!inner(reading_ts, voltage_v)";
  let { data: sample, error } = await admin.supabase.from("test_point_readings").select(select)
    .not("reading_batches.voltage_v", "is", null).order("created_at", { ascending: false }).limit(1);
  assert.ifError(error);
  if (!sample.length) {
    ({ data: sample, error } = await admin.supabase.from("test_point_readings").select(select).order("created_at", { ascending: false }).limit(1));
    assert.ifError(error);
  }
  if (!sample.length) { t.skip("staging has no readings to look up"); return; }
  const row = sample[0];
  const stored = row.reading_batches.reading_ts;
  const { data: sameInstant, error: sameError } = await admin.supabase.from("test_point_readings")
    .select("test_point_id, reading_batches!inner(reading_ts)").eq("reading_batches.reading_ts", stored);
  assert.ifError(sameError);
  const counts = async () => Promise.all(["reading_batches", "test_point_readings"].map(async (table) => {
    const { count, error: countError } = await admin.supabase.from(table).select("id", { count: "exact", head: true });
    assert.ifError(countError);
    return count;
  }));
  const before = await counts();

  // The real endpoint (test router: HTTPS=on) against the staging project; ingestion stays off.
  const reservation = http.createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const server = spawn(php, ["-d", "display_errors=0", "-d", "display_startup_errors=0", "-S", `127.0.0.1:${port}`, "tests/php/api-router.php"], {
    cwd: path.join(__dirname, ".."), stdio: "ignore",
    env: { ...process.env, SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, CPM_READINGS_READ_ENABLED: "1", CPM_INGESTION_ENABLED: "0" },
  });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await fetch(`${base}/api/v1/readings/`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  const get = (query, route = "/api/v1/readings/", bearer = token) =>
    fetch(`${base}${route}${query}`, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  const ts = encodeURIComponent(stored);
  const expected = { timestamp: apiTimestamp(stored), value: row.value_mv, testPointId: row.test_point_id, field: "potential", unit: "mV" };

  await t.test("exact timestamp + testPointId returns the stored potential", async () => {
    const response = await get(`?timestamp=${ts}&field=potential&testPointId=${row.test_point_id}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.some((item) => JSON.stringify(item) === JSON.stringify(expected)), JSON.stringify(body));
  });

  await t.test("without testPointId, every reading at that instant is returned, ordered", async () => {
    const body = await (await get(`?timestamp=${ts}&field=potential`)).json();
    assert.equal(body.length, sameInstant.length);
    const ids = body.map((item) => item.testPointId);
    assert.deepEqual(ids, [...ids].sort());
  });

  await t.test("same instant with a +08:00 offset; one second later is a different instant", async () => {
    const direct = await (await get(`?timestamp=${ts}&field=potential`)).text();
    assert.equal(await (await get(`?timestamp=${encodeURIComponent(singaporeTimestamp(stored))}&field=potential`)).text(), direct);
    const later = new Date(new Date(stored).getTime() + 1000).toISOString();
    const { data: laterRows } = await admin.supabase.from("test_point_readings")
      .select("id, reading_batches!inner(reading_ts)").eq("reading_batches.reading_ts", later);
    assert.equal((await (await get(`?timestamp=${encodeURIComponent(later)}&field=potential`)).json()).length, laterRows.length);
  });

  await t.test("field=voltage returns the stored rectifier voltage", { skip: row.reading_batches.voltage_v === null ? "no staging reading with voltage_v" : false }, async () => {
    const body = await (await get(`?timestamp=${ts}&field=voltage&testPointId=${row.test_point_id}`)).json();
    assert.deepEqual(body.map((item) => [item.value, item.unit]), [[Number(row.reading_batches.voltage_v), "V"]]);
  });

  await t.test("paging with limit=1 links to the next page when there is one", async () => {
    const response = await get(`?timestamp=${ts}&field=potential&limit=1`);
    assert.equal((await response.json()).length, 1);
    assert.equal(response.headers.get("link") !== null, sameInstant.length > 1);
  });

  await t.test("the /api/readings alias gives the same answer", async () => {
    const query = `?timestamp=${ts}&field=potential`;
    assert.equal(await (await get(query, "/api/readings")).text(), await (await get(query)).text());
  });

  await t.test("missing field 400, missing timestamp 400 (exact body), no or bad token 401", async () => {
    let response = await get(`?timestamp=${ts}`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: "Invalid or missing field" });
    response = await get("?field=potential");
    assert.equal(await response.text(), '{"message":"Invalid or missing timestamp"}');
    assert.equal((await get(`?timestamp=${ts}&field=potential`, "/api/v1/readings/", "")).status, 401);
    assert.equal((await get(`?timestamp=${ts}&field=potential`, "/api/v1/readings/", "not-a-real-token")).status, 401);
  });

  await t.test("GET wrote nothing", async () => {
    assert.deepEqual(await counts(), before);
  });
});
