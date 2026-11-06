# Readings API v1

Status: **ready for staging verification; disabled by default.** Migrations prepared, not applied. Updated 29 Oct 2026 (go-live preparation: current/voltage, plausibility limits, request IDs, runbook); GET retrieval added 4 Nov 2026 (no migration needed).

Purpose: let an external system (data logger, script, client software) send readings directly instead of a person uploading an Excel file (**POST ingestion**), and retrieve stored readings by timestamp (**GET retrieval**, added 4 Nov 2026 for Zhen Qi's request).

Main endpoint, two methods: `https://<deployment>/api/v1/readings/` (directory index; include the trailing slash). Any other method returns 405 with `Allow: GET, POST`. A **GET-only alias** `/api/readings` (see below) serves retrieval. PHP 8.1+ with cURL and JSON; Apache DocumentRoot `www/`, DirectoryIndex `index.php`, `AllowOverride All` (mod_rewrite).

## GET retrieval

Status: **implemented and tested against a Supabase stub (PHP built-in server, plus one local Apache run of the `.htaccess` alias). Not yet run on staging. Disabled by default** (`CPM_READINGS_READ_ENABLED=1` turns it on, independently of the POST flag `CPM_INGESTION_ENABLED`).

> **Client decisions, 4 Nov 2026** (answers to the open GET questions, relayed by Owen):
> 1. **Array format confirmed**: always a JSON array, `[]` when nothing matches.
> 2. **`field` is required**: a request without it is rejected (400). This replaces the earlier "`field` optional, default potential" proposal.
> 3. **Exact timestamp matching confirmed** (no nearest-reading lookup).
> 4. **Paging approved**: `limit` / `offset` (below). This replaces the 1,000-match 422 refusal.
> 5. **`/api/readings` confirmed** as the client path (alias of v1).
>
> **Still pending:** the **measurement interpretation** of each `field` value, in particular `voltage` = rectifier output in V (`reading_batches.voltage_v`) and `potential` = pipe-to-soil potential in mV. The client did not object, but did not explicitly confirm it either.

### Client requirement (Zhen Qi)

Mandatory in a successful response: `timestamp` (ISO 8601) and `value`. `testPointId` is optional. `field` was optional in the original request; since 4 Nov it is **required**. A missing or invalid timestamp returns HTTP 400 `{"message":"Invalid or missing timestamp"}`. The client's `GET /v1/read?testPointId=TP-001&...` URL and the `TP-001` id are illustrative. Test point ids are the database UUIDs.

### Paths

| Path | Methods | Notes |
| --- | --- | --- |
| `/api/v1/readings/` | GET, POST | Versioned endpoint; POST ingestion is unchanged |
| `/api/readings` and `/api/readings/` | **GET only** | Alias for the client's `GET /api/readings`. `www/.htaccess` rewrites it internally (no redirect) to `www/api/readings.php`, which runs the same handler as v1: same validation, authorisation, feature flag and response. Any other method returns 405 `Allow: GET` `{"message":"Method not allowed"}`, never reaches Supabase and can never ingest. `/api/readings.php` behaves the same. Needs mod_rewrite with `AllowOverride All`; without it the alias returns 404 and v1 is unaffected |

### Request

```http
GET /api/readings?timestamp=2026-11-02T10:00:00Z&field=potential
GET /api/v1/readings/?timestamp=2026-11-02T10:00:00Z&field=voltage&testPointId=<uuid>
Authorization: Bearer <Supabase access token>
```

| Parameter | Required | Rule |
| --- | --- | --- |
| timestamp | yes | RFC 3339 / ISO 8601 with seconds and `Z` or an offset from -14:00 to +14:00 (the same rule as POST `reading_ts`); up to 6 fractional digits; real calendar date. Encode `+` as `%2B`; an unencoded `+08:00` (which arrives as a space) is also accepted |
| field | **yes** | `potential`, `voltage`, `current`, `power`, `temperature`, `conductivity`, `ph`, `dissolved_oxygen` (exact, lower case) |
| testPointId | no | Test point UUID (case-insensitive). Human-readable ids such as `TP-001` are rejected: no such column exists |
| limit | no | Page size, 1 to 1,000 (default 1,000; `APP_SETTINGS['retrieval']['max_page_size']`) |
| offset | no | Rows to skip, 0 to 9,999,999 (default 0) |

Validation order: `timestamp`, then `testPointId`, then `field`, then `limit`, then `offset`. The first failure is reported. All of these are 400:
- any other parameter → `{"message":"Unexpected query parameter"}`
- invalid `testPointId` → `{"message":"Invalid testPointId"}`
- missing or invalid `field` → `{"message":"Invalid or missing field"}`
- invalid `limit` → `{"message":"Invalid limit (1 to 1000)"}`
- invalid `offset` → `{"message":"Invalid offset"}`

### Paging

Results are ordered by `testPointId`, then internal reading id, so pages are stable while the data does not change. When more rows exist after the current page, the response carries a `Link` header:

```http
Link: </api/readings?timestamp=2026-11-02T10%3A00%3A00.000000Z&field=potential&limit=1000&offset=1000>; rel="next"
```

Follow it until there is no `Link` header. A page past the end is 200 `[]`. The body is always a plain array; paging information is only in the header. The link uses the path the client called (`/api/readings` or `/api/v1/readings/`) and the normalised UTC timestamp. Readings added or deleted at that exact instant between page requests can shift rows across pages (offset paging).

### Response (always a JSON array)

```json
{"timestamp":"2026-11-02T10:00:00Z","value":12.5}
```

That is the client's minimum shape for one reading. The API returns an **array** of such objects, and each item also carries optional metadata:

```json
[{"timestamp":"2026-11-02T10:00:00Z","value":-850,"testPointId":"<uuid>","field":"potential","unit":"mV"}]
```

Examples are illustrative, not evidence that this reading exists in the database.

| Decision | Behaviour | Status |
| --- | --- | --- |
| Response format | Always a JSON array, even for one match. Each item: required `timestamp`, `value`; optional `testPointId`, `field`, `unit` | **Confirmed by client, 4 Nov** |
| Several matches (several test points at one instant) | 200, all of them (paged), ordered by `testPointId` then internal reading id. Nothing is dropped or picked arbitrarily | **Confirmed (array), 4 Nov** |
| No match | 200 `[]` | **Confirmed by client, 4 Nov** |
| Matching | **Exact instant** on `reading_batches.reading_ts`. `2026-11-02T18:00:00+08:00` and `2026-11-02T10:00:00Z` are the same instant. There is no nearest-reading lookup | **Confirmed by client, 4 Nov** |
| Paging | `limit` (max and default 1,000) / `offset`, `Link rel="next"` | **Approved by client, 4 Nov**; parameter design is the team's |
| `field` | Required; no default | **Client decision, 4 Nov** |
| Time zone | Response `timestamp` is always UTC with `Z`; fractional seconds appear only when stored | Proposed (the app displays Asia/Singapore; the API uses UTC like the client example) |
| `field=potential` (measurement interpretation) | `test_point_readings.value_mv` in **mV** (e.g. -850). It is **not** converted to volts | **Proposed, pending client confirmation** |
| `field=voltage` (measurement interpretation) | `reading_batches.voltage_v`, the rectifier output voltage in **V** (D-MEAS-1). This is what the client's `voltage` 12.5 example appears to mean; it is not the pipe-to-soil potential | **Proposed, pending client confirmation** |
| Other fields | current A, power W (calculated V × I), temperature °C, conductivity µS/cm, pH, dissolved oxygen mg/L, all from `reading_batches` | |
| Field not recorded | A reading whose batch has no value for the requested field is omitted (never returned as 0 or null) | |
| Batch values | Batch measurements are shared by every test point reading in that batch (e.g. an Excel batch for one location), so each of those test points shows the same value | Data model fact |
| `value` type | JSON number (integer for potential, decimal for batch measurements), never a string | |

### Authentication and authorisation

- `Authorization: Bearer <Supabase access token>`, verified with Supabase Auth. Anonymous reads are refused (401).
- The account must be **active** with role `admin` or `corrosion_engineer` (its own `users` row, readable under RLS). Otherwise the response is 403 `{"message":"Read denied"}`.
- The readings query runs with the **caller's token and the publishable key**, so RLS decides what is visible. Today that means any active user can read all readings, the same as in the web app. No service-role key is used.
- The POST scope list (`CPM_INGESTION_SCOPES`) applies to writes only. GET has no per-point read scope, because the database grants none.
- HTTPS is required (403 `{"message":"HTTPS required"}`), using the same rule as POST.
- GET is read-only: it issues only `GET` requests to Supabase and never calls `ingest_reading_v1` or any other RPC.

### Errors (body is always `{"message": "..."}`)

| HTTP | message |
| --- | --- |
| 400 | `Invalid or missing timestamp` / `Invalid testPointId` / `Invalid or missing field` / `Invalid limit (1 to 1000)` / `Invalid offset` / `Unexpected query parameter` |
| 401 | `Invalid or missing token` |
| 403 | `HTTPS required` / `Read denied` |
| 405 | `Method not allowed` (`/api/readings` alias, non-GET; `Allow: GET`) |
| 503 | `Readings retrieval is disabled` / `Service unavailable` |
| 500 | `Retrieval failed` / `Internal error` (database details are never returned) |

Every response has `Content-Type: application/json`, `Cache-Control: no-store` and `X-Request-Id`. The server log line records the method, request id, status and outcome only, never the token, query values or reading values.

#### Example (fictional)

```sh
curl --fail-with-body -i "https://monitor.example.invalid/api/readings?timestamp=2026-11-02T10:00:00Z&field=voltage" \
  -H "Authorization: Bearer $READER_ACCESS_TOKEN"   # -i shows the Link header when there is another page
```

### Staging verification checklist (not yet run)

Staging only, synthetic data only, HTTPS Apache with the deployed `www/.htaccess`. GET writes nothing. The only write is the POST in step 0, which uses the existing ingestion runbook. Record the status code and `X-Request-Id` for each step (no tokens) in `docs/week9/test-matrix.md` row D05. `$R` = a reader token (an active engineer or admin), `$B` = `https://<staging-host>`.

**0. Setup**
- [ ] `SetEnv CPM_READINGS_READ_ENABLED "1"` on staging only; reload Apache.
- [ ] Note one **variable** test point UUID `$VP` and one **stationary** `$SP` (synthetic).
- [ ] Create known readings through the POST runbook (step 4): on `$VP` at `T1 = 2026-11-02T10:00:00Z` with `"current_a":10,"voltage_v":24.5`, and on `$SP` at the same `T1`. Optionally, enter a manual reading in the app at `T2` and note the exact time.

**1. Retrieval**
- [ ] `GET $B/api/readings?timestamp=T1&field=potential` → 200 array with both points, ordered by `testPointId`, numeric `value` (mV), `timestamp` = `T1` in UTC `Z`, no `Link` header.
- [ ] Same request on `$B/api/readings/?…` and `$B/api/v1/readings/?…` → identical body, no redirect (`curl -i` shows no `Location`).
- [ ] Without `field` (`?timestamp=T1`) → 400 `{"message":"Invalid or missing field"}`.
- [ ] Repeat the request → same order.
- [ ] The values match the Test Point page / Data History for those readings.

**2. Timestamp matching**
- [ ] (All with `&field=potential`.) `T1` written as `2026-11-02T18:00:00%2B08:00` → same result; unencoded `+08:00` → same result.
- [ ] `T1` + 1 second (`…10:00:01Z`) → 200 `[]` (exact match only).
- [ ] A manual reading entered in the app at `T2` is found with its stored instant. Check that the app's stored seconds/milliseconds match what you query.
- [ ] Missing `timestamp`, `2026-02-30T10:00:00Z`, `2026-11-02T10:00:00` (no zone), `…+15:00` → 400 `{"message":"Invalid or missing timestamp"}` exactly.

**3. Filters, field and paging**
- [ ] `&field=potential&testPointId=$VP` → only `$VP`. Upper-case UUID → same. `testPointId=TP-001` → 400 `Invalid testPointId`.
- [ ] `&testPointId=$VP&field=voltage` → `value` 24.5, `unit` "V". `field=current` → 10. `field=power` → 245 (V × I trigger).
- [ ] `&testPointId=$SP&field=voltage` → `[]` (stationary points have no rectifier values).
- [ ] `field=value_mv`, `field=Voltage` or an extra parameter → 400.
- [ ] Paging: `&field=potential&limit=1` → first point only, with `Link: </api/readings?…&limit=1&offset=1>; rel="next"`. Following the link gives the second point and no `Link`. `offset=2` → `[]`. `limit=0`, `limit=1001`, `offset=-1` → 400.
- [ ] Optional, if staging has a batch with more than 1,000 test points at one instant: the default page is exactly 1,000 rows, and the pages joined together equal the full set (no repeats or gaps).

**4. Authentication and transport**
- [ ] No `Authorization` → 401. Garbage or expired token → 401.
- [ ] Plain `http://` (if reachable) → 403 `HTTPS required`.
- [ ] Unset `CPM_READINGS_READ_ENABLED` → 503 for GET on both paths, while POST behaves as before (and the reverse with `CPM_INGESTION_ENABLED`). Restore the flag afterwards.
- [ ] `POST`/`PUT`/`DELETE` on `/api/readings` → 405 `Allow: GET`; no new row in `reading_batches`.

**5. Database permissions**
- [ ] Deactivate a test engineer account (admin page), then GET with its still-valid token → 403 `Read denied`. Reactivate it.
- [ ] Postgres logs / Supabase API logs for the GET requests show only `GET` on `auth/v1/user`, `rest/v1/users` and `rest/v1/test_point_readings`, with no `rpc/` call. The row counts of `reading_batches` / `test_point_readings` are unchanged across steps 1–5.
- [ ] Confirm RLS on staging still matches the source: `select polname, polcmd, polroles::regrole[] from pg_policy where polrelid in ('public.test_point_readings'::regclass, 'public.reading_batches'::regclass);` shows SELECT for `authenticated` gated by `current_user_is_active()` only (no anon policy).
- [ ] An anon-only request straight to PostgREST (`apikey` = publishable key, no user token) on `test_point_readings` returns no rows. This shows the alias adds no new path to the data.

## POST ingestion

### Authentication and authorisation

`Authorization: Bearer <Supabase access token>` of a **dedicated ingestion account** (an ordinary engineer account created on the admin page). The server verifies the token with Supabase Auth. No service-role key and no separate API-key store are used; cookies and CORS are not accepted.

Three checks must all pass:

1. **Database:** the account is active and is an admin or a corrosion engineer; an engineer account may write only to test points assigned to it. The test point must be active.
2. **Server scope:** `CPM_INGESTION_SCOPES` lists, per account id, the exact test point ids it may write to. No wildcard. Case-insensitive.
3. **Feature flag:** `CPM_INGESTION_ENABLED=1`.

Recommended: make the ingestion account a **corrosion engineer** and assign it only the points it reports for, so the database enforces the scope as well.

Tokens expire after about an hour. The sending system signs in with the account's email and password and refreshes or re-signs in as needed. `scripts/api/send-reading.js` is a working reference client.

### Request

One JSON object per request, UTF-8 `application/json`, at most 16,384 bytes, no arrays or unknown fields. Optional fields may be omitted or `null`. Numbers sent as strings are rejected.

| Field | Required | Rule | Stored in |
| --- | --- | --- | --- |
| test_point_id | yes | UUID; active, in scope, authorised | test_point_readings.test_point_id |
| reading_ts | yes | RFC 3339 with seconds and `Z` or an offset from -14:00 to +14:00; up to 6 fractional digits; **not more than 5 minutes in the future and not before 2000-01-01** | reading_batches.reading_ts |
| value_mv | yes | integer, **-5000 to 5000** mV | test_point_readings.value_mv |
| temperature_c | no | **-50 to 150** °C | reading_batches.temperature_c |
| medium_conductivity | no | 0 to 1,000,000 µS/cm | reading_batches.medium_conductivity |
| ph | no | 0 to 14 | reading_batches.ph |
| dissolved_oxygen | no | **0 to 25** mg/L | reading_batches.dissolved_oxygen |
| current_a | no | 0 to 300 A; **variable test points only** | reading_batches.current_a |
| voltage_v | no | 0 to 200 V; **variable test points only** | reading_batches.voltage_v |

**Why stricter than the Excel import:** the import shows warnings that a person reviews before saving. Nobody reviews an API reading, so values the import would only warn about are rejected. The ranges are **provisional** until the client confirms instrument ranges. They live in `www/php/app-settings.php` (`ingestion`) and are repeated in `ingest_reading_v1`; `tests/readings-api-limits.test.js` fails if the two drift apart.

**Power is never sent.** It is calculated as V × I by the `reading_batches_calculate_power` trigger (D-MEAS-2) when both current and voltage are present. Sending `power_watts` returns 422. Clients cannot set thresholds, classification, `entered_by`, `source_file`, `upload_method` or summaries.

#### Example (fictional)

```sh
curl --fail-with-body https://monitor.example.invalid/api/v1/readings/ \
  -H "Authorization: Bearer $INGESTION_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"test_point_id":"00000000-0000-4000-8000-000000000001","reading_ts":"2026-10-24T12:00:00+08:00","value_mv":-850,"temperature_c":28.5,"ph":7.2,"current_a":12.5,"voltage_v":24}'
```

Or with the reference client: `node scripts/api/send-reading.js '{"test_point_id":"<uuid>","value_mv":-850}'` (`reading_ts` defaults to now).

### Responses

201: `{"ok":true,"reading_id":"<uuid>"}`. Errors: `{"ok":false,"error":"<code>"}`. Every response has an `X-Request-Id` header that also appears in the server log line, so a failure can be traced without logging tokens or values. Database errors are never returned raw.

| HTTP | Meaning |
| --- | --- |
| 201 | Reading, batch and daily/weekly summaries committed |
| 400 / 422 | Malformed JSON / invalid field, out-of-range value, future or too-old time, current/voltage on a stationary point |
| 401 | Missing or invalid token |
| 403 | Not HTTPS, test point out of scope, or account/point not authorised |
| 405 / 413 / 415 | Wrong method / body over 16 KB / not `application/json` |
| 409 | A reading for that test point already exists within ±1 minute (also returned for retries of a request that already succeeded) |
| 429 | 60 readings in the last minute for this account; `Retry-After: 60` |
| 503 | `ingestion_disabled`, `ingestion_misconfigured` (scope config missing or invalid), or Supabase unavailable |
| 500 | Unexpected failure |

Retries are safe: they never overwrite, a repeat of a stored reading gets 409. The whole write is one transaction; any failure rolls back the reading, batch and summaries.

## Go-live runbook (owner actions, in order)

Do every step on **staging** first, then repeat on live only with Alex's approval (CLAUDE.md: Alex applies live migrations).

**1. Database** (SQL editor of the target project)

1. Confirm `20261008110000_harden_function_privileges.sql` (#133) and `20261008120000_add_current_voltage.sql` (#134) are applied. The new API migration refuses to run without #134.
2. Apply `supabase/migrations/20261024090000_ingest_reading_v1.sql`, then `supabase/migrations/20261029090000_ingest_reading_v1_electrical_and_limits.sql`.
3. Run `supabase/queries/ingest_api_staging_checks.sql`; every row must show `ok = true`.

**2. Ingestion account**

1. An Admin creates a dedicated account (e.g. `ingestion@…`), role **Corrosion Engineer**, strong unique password stored only in the sending system's secret store.
2. Assign it the test points it will report for (Test Points page). Note the account id and the point ids (sections 2–3 of the check script).

**3. Web server** (Apache, server config or vhost, not committed)

```apache
SetEnv SUPABASE_URL "https://<project-ref>.supabase.co"
SetEnv SUPABASE_PUBLISHABLE_KEY "<publishable key of that project>"
SetEnv CPM_INGESTION_SCOPES "{\"<account-uuid>\":[\"<point-uuid-1>\",\"<point-uuid-2>\"]}"
# SetEnv CPM_INGESTION_ENABLED "1"   <- only in step 5
# SetEnv CPM_READINGS_READ_ENABLED "1"  <- GET retrieval; only after its staging check
CGIPassAuth On                       # PHP-FPM/CGI only: pass Authorization to PHP
```

- HTTPS terminates at Apache or a trusted proxy that sets `HTTPS=on`; never trust client-supplied forwarded headers.
- `php.ini`: `display_errors=Off`, `display_startup_errors=Off`, `log_errors=On`; restrict who can read the logs and set retention.
- Add request/body limits and rate limiting for failed requests at the proxy (the database limit only counts successful writes).

**4. Staging verification** (scope still set, flag on for staging only)

1. `node scripts/api/send-reading.js '{"test_point_id":"<in-scope point>","value_mv":-850}'` → 201. Check it in the app: Test Point page, history, dashboard, weekly summary, the same as a manual reading.
2. Same command again with the same `reading_ts` → 409.
3. Variable point with `"current_a":10,"voltage_v":24` → 201, and section 4 of the check script shows `power_watts = 240`. The same on a stationary point → 422.
4. Point not in the scope list → 403 `scope_denied`; point in the scope list but not assigned to the account → 403 `write_denied` (proves the database check); `"value_mv":9000` → 422; `"reading_ts"` one hour ahead → 422; no token → 401; plain HTTP → 403.
5. 61 quick writes → the 61st is 429.
6. Record results (status codes, request ids, query output; no tokens or client data) in `docs/week9/test-matrix.md` rows D01–D03.

**5. Go live**

1. Alex applies the two migrations on live and runs the check script.
2. Create the live ingestion account and assignments, set the live `SetEnv` values including `CPM_INGESTION_ENABLED "1"`, reload Apache.
3. Send one smoke reading and confirm it in the app.

**Turning it off:** remove `CPM_INGESTION_ENABLED` (or set it to `0`) and reload Apache → 503 immediately. To block the account entirely, deactivate it on the admin page (works within one request; also stops direct RPC calls). Database rollback: `supabase/rollbacks/20261029090000_ingest_reading_v1_electrical_and_limits_rollback.sql` (back to the 24 Oct version), then `20261024090000_ingest_reading_v1_rollback.sql` (drops the function). Readings already stored are kept.

## Known limits (not blockers for go-live)

- **One reading per request.** A spreadsheet row with 20 test points is 20 requests, each with its own batch (the in-app per-test-point Excel import does the same). For backfills, 60 readings per minute per account applies. A batch endpoint should reuse `import_reading_rows` from the bulk-import task (#82, plan §3.1) rather than duplicate it.
- **API readings are stored as `upload_method = 'manual'`**, because the shared `create_manual_reading` sets it. Separate source attribution needs a schema decision (follow-up).
- **The feature flag and scope list live in PHP.** A signed-in user can call `ingest_reading_v1` directly on Supabase, bypassing them. This grants nothing beyond what the account could already do through manual entry: the database checks role, active status and assignment. Deactivating the account is the database-level stop.
- **Mixed API/manual/Excel duplicates:** only API writers lock the test point, so an API write and a simultaneous manual entry for the same point and minute could both succeed. Check during staging; a database-wide guard needs the import work in #82.
- **GET retrieval** uses exact-instant matching (client-confirmed) and offset paging. Range queries ("all readings between A and B") and nearest-reading lookups are not built. The measurement interpretation of `field` values (potential mV, voltage = rectifier V) is still pending explicit client confirmation.
