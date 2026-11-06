#!/usr/bin/env node
/**
 * Readings API v1 smoke test / reference client (docs/week9/readings-api.md).
 *
 * Signs in as the dedicated ingestion account, then POSTs one reading.
 *
 *   node scripts/api/send-reading.js '{"test_point_id":"<uuid>","value_mv":-850}'
 *   node scripts/api/send-reading.js reading.json
 *
 * reading_ts defaults to now. Settings come from the untracked root .env:
 *   CPM_API_URL              https://<deployment>/api/v1/readings/  (HTTPS; http only for localhost)
 *   SUPABASE_URL             the project the deployment uses (staging while testing)
 *   SUPABASE_PUBLISHABLE_KEY publishable key of that project
 *   CPM_API_EMAIL / CPM_API_PASSWORD  the ingestion account (never commit these)
 */
require("dotenv").config({ path: require("node:path").join(__dirname, "..", "..", ".env") });
const fs = require("node:fs");
const { createClient } = require("@supabase/supabase-js");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readReading(arg) {
  if (!arg) fail("Usage: node scripts/api/send-reading.js '<json>' | <file.json>");
  const text = fs.existsSync(arg) ? fs.readFileSync(arg, "utf8") : arg;
  let reading;
  try {
    reading = JSON.parse(text);
  } catch {
    fail("The reading is not valid JSON.");
  }
  if (!reading || typeof reading !== "object" || Array.isArray(reading)) fail("Send one JSON object.");
  return { reading_ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), ...reading };
}

async function main() {
  const env = process.env;
  for (const key of ["CPM_API_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "CPM_API_EMAIL", "CPM_API_PASSWORD"]) {
    if (!env[key]) fail(`Missing ${key} in .env`);
  }
  const apiUrl = new URL(env.CPM_API_URL);
  if (apiUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(apiUrl.hostname)) {
    fail("CPM_API_URL must use HTTPS.");
  }
  const reading = readReading(process.argv[2]);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: env.CPM_API_EMAIL,
    password: env.CPM_API_PASSWORD,
  });
  if (error || !data.session) fail(`Sign-in failed: ${error?.message || "no session"}`);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(reading),
    });
    const body = await response.text();
    console.log(`HTTP ${response.status}  request ${response.headers.get("x-request-id") || "-"}`);
    console.log(body);
    process.exitCode = response.status === 201 ? 0 : 1;
  } finally {
    await supabase.auth.signOut();
  }
}

main().catch((error) => fail(error.message));
