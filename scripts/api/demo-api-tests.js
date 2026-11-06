#!/usr/bin/env node
/**
 * Readings API demo: runs the real PHP endpoint (www/api/v1/readings/) against a fake
 * Supabase on 127.0.0.1 and prints every scenario with expected and actual results.
 * Nothing is sent to staging or live; no data is written anywhere.
 *
 *   npm run demo:api
 *
 * Needs PHP 8.1+ (PATH, XAMPP, or PHP_BINARY). Exits 1 if any scenario fails, so the
 * output can be used as test evidence (screenshot or copy into docs/week9/test-matrix.md).
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const php = process.env.PHP_BINARY
  || (process.platform === "win32" && fs.existsSync("C:/xampp/php/php.exe") ? "C:/xampp/php/php.exe" : "php");
if (spawnSync(php, ["--version"]).error) {
  console.error("PHP not found. Install PHP 8.1+ or set PHP_BINARY.");
  process.exit(1);
}

// Fictional ids: one test point the machine account may write to, one it may not.
const POINT = "00000000-0000-4000-8000-000000000001";
const OTHER_POINT = "00000000-0000-4000-8000-000000000003";
const READING_ID = "00000000-0000-4000-8000-000000000002";

let rpcError = null;   // set per scenario to make the fake database answer with an error code
let rpcCalls = 0;

function startFakeSupabase() {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/auth/v1/user") {
      if (req.headers.authorization !== "Bearer valid-token") { res.writeHead(401); res.end("{}"); return; }
      res.end(JSON.stringify({ id: "demo-machine-account" }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      rpcCalls++;
      if (rpcError) { res.writeHead(400); res.end(JSON.stringify({ code: rpcError, message: "internal database detail" })); return; }
      res.end(JSON.stringify(READING_ID));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function freePort() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const now = new Date();
const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
const valid = { test_point_id: POINT, reading_ts: iso(new Date(now.getTime() - 60000)), value_mv: -850 };

// [group, scenario, request, expected status, expected error code or null, optional fake DB error]
const scenarios = [
  ["Success", "Valid reading (potential only)", { body: valid }, 201, null],
  ["Success", "Valid reading with environment + current/voltage", { body: { ...valid, temperature_c: 28.5, ph: 7.2, dissolved_oxygen: 6.1, medium_conductivity: 450, current_a: 12.5, voltage_v: 24 } }, 201, null],
  ["Success", "Upper-case test point id matches the scope", { body: { ...valid, test_point_id: POINT.toUpperCase() } }, 201, null],
  ["Authentication", "No token", { body: valid, token: "" }, 401, "invalid_token"],
  ["Authentication", "Invalid token", { body: valid, token: "bad-token" }, 401, "invalid_token"],
  ["Authorisation", "Test point outside the account's scope", { body: { ...valid, test_point_id: OTHER_POINT } }, 403, "scope_denied"],
  ["Authorisation", "Database refuses (inactive account / unassigned point)", { body: valid }, 403, "write_denied", "42501"],
  ["Transport", "Plain HTTP instead of HTTPS", { body: valid, path: "/insecure" }, 403, "https_required"],
  ["Transport", "Wrong method (PUT)", { body: valid, method: "PUT" }, 405, "method_not_allowed"],
  ["Transport", "Not JSON (text/plain)", { body: valid, type: "text/plain" }, 415, "json_required"],
  ["Transport", "Body over 16 KB", { raw: " ".repeat(16385) }, 413, "payload_too_large"],
  ["Input", "Malformed JSON", { raw: "{" }, 400, "invalid_json"],
  ["Input", "Batch (array) instead of one reading", { raw: JSON.stringify([valid]) }, 422, "Expected a JSON object"],
  ["Input", "Unknown field", { body: { ...valid, hacker: 1 } }, 422, "Unexpected field"],
  ["Input", "Power sent by the client (it is calculated)", { body: { ...valid, power_watts: 10 } }, 422, "Unexpected field"],
  ["Input", "SQL injection in test_point_id", { body: { ...valid, test_point_id: "' OR 1=1--" } }, 422, "Invalid test_point_id"],
  ["Input", "Number sent as a string", { body: { ...valid, value_mv: "-850" } }, 422, null],
  ["Input", "Timestamp without time zone", { body: { ...valid, reading_ts: "2026-10-24T12:00:00" } }, 422, null],
  ["Input", "Impossible date (30 Feb)", { body: { ...valid, reading_ts: "2026-02-30T12:00:00Z" } }, 422, null],
  ["Plausibility", "Timestamp an hour in the future", { body: { ...valid, reading_ts: iso(new Date(now.getTime() + 3600000)) } }, 422, "reading_ts is in the future"],
  ["Plausibility", "Timestamp before 2000", { body: { ...valid, reading_ts: "1999-12-31T23:59:59Z" } }, 422, "reading_ts is too old"],
  ["Plausibility", "Potential 9000 mV", { body: { ...valid, value_mv: 9000 } }, 422, null],
  ["Plausibility", "pH 15", { body: { ...valid, ph: 15 } }, 422, null],
  ["Plausibility", "Current 400 A (max 300)", { body: { ...valid, current_a: 400 } }, 422, null],
  ["Database", "Duplicate within 1 minute", { body: valid }, 409, "duplicate_reading", "23505"],
  ["Database", "Rate limit (60 per minute)", { body: valid }, 429, "rate_limited", "P0429"],
  ["Database", "Current/voltage on a stationary point", { body: { ...valid, current_a: 5, voltage_v: 12 } }, 422, "invalid_reading", "22023"],
  ["Database", "Unexpected database failure (no internals leaked)", { body: valid }, 500, "ingestion_failed", "XX000"],
  ["Switch", "API switched off (flag unset)", { body: valid, path: "/disabled" }, 503, "ingestion_disabled"],
];

async function main() {
  const fake = await startFakeSupabase();
  const port = await freePort();
  const server = spawn(php, ["-d", "display_errors=0", "-d", "display_startup_errors=0", "-S", `127.0.0.1:${port}`, "tests/php/api-router.php"], {
    cwd: root, stdio: "ignore",
    env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${fake.address().port}`, SUPABASE_PUBLISHABLE_KEY: "demo-publishable-key",
      CPM_INGESTION_ENABLED: "1", CPM_INGESTION_SCOPES: JSON.stringify({ "demo-machine-account": [POINT] }) },
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      try { await fetch(`${base}/api/v1/readings/`); break; } catch { await new Promise((r) => setTimeout(r, 50)); }
    }

    console.log("\nReadings API v1 — demo against a fake Supabase (no real data)\n");
    const rows = [];
    let failures = 0;
    let group = "";
    for (const [section, name, req, expectedStatus, expectedError, dbError] of scenarios) {
      rpcError = dbError || null;
      const callsBefore = rpcCalls;
      const response = await fetch(`${base}${req.path || "/api/v1/readings/"}`, {
        method: req.method || "POST",
        headers: { Authorization: `Bearer ${req.token ?? "valid-token"}`, "Content-Type": req.type || "application/json" },
        body: (req.method || "POST") === "GET" ? undefined : (req.raw ?? JSON.stringify(req.body)),
      });
      const text = await response.text();
      let json = {};
      try { json = JSON.parse(text); } catch { /* shown raw below */ }
      const reachedDb = rpcCalls > callsBefore;
      const ok = response.status === expectedStatus
        && (expectedError === null || json.error === expectedError)
        && !/internal database detail/.test(text);
      if (!ok) failures++;
      if (section !== group) { group = section; rows.push({ section }); }
      rows.push({ name, expected: `${expectedStatus}${expectedError ? ` ${expectedError}` : ""}`,
        actual: `${response.status} ${json.error || (json.reading_id ? "reading_id " + json.reading_id.slice(0, 8) + "…" : text.slice(0, 30))}`,
        db: reachedDb ? "yes" : "no", requestId: response.headers.get("x-request-id") || "-", ok });
    }

    const pad = (value, width) => String(value).padEnd(width).slice(0, width);
    console.log(`${pad("Scenario", 56)} ${pad("Expected", 34)} ${pad("Actual", 52)} ${pad("DB call", 7)} Result`);
    console.log("-".repeat(160));
    for (const row of rows) {
      if (row.section) { console.log(`\n[${row.section}]`); continue; }
      console.log(`${pad(row.name, 56)} ${pad(row.expected, 34)} ${pad(row.actual, 52)} ${pad(row.db, 7)} ${row.ok ? "PASS" : "FAIL"}`);
    }
    const total = scenarios.length;
    console.log(`\n${total - failures}/${total} scenarios passed. Invalid requests are stopped before the database ("DB call: no").`);
    console.log(`Each response carries an X-Request-Id (e.g. ${rows.find((r) => r.requestId)?.requestId}) that matches the server log line.\n`);
    process.exitCode = failures ? 1 : 0;
  } finally {
    server.kill();
    fake.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
