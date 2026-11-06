# Week 9 test matrix — 24 October 2026

Follow-up: XLSX dependency remediation supersedes the original Q04 failure below. See [remediation evidence and new spreadsheet compatibility tests](dependency-remediation.md). Baseline results below are retained as historical evidence.

Use synthetic/local fixtures only. Existing tests mostly exercise pure modules or inspect source; an automated test pass is not browser UAT or live database proof. New HTTP tests launch PHP with displayed errors disabled and a loopback-only Supabase transport stub; fixture IDs and responses are fictional, servers are closed on completion, and no persistent data is created.

## Update — 4 November 2026 (GET retrieval for the client's Readings API request)

Local Windows host, XAMPP PHP 8.2.12. All rows below are **stub/source results**; nothing was run against staging or live. Rows reflect the final contract after the client decisions of 4 Nov (array confirmed, `field` required, exact match, paging approved, `/api/readings` confirmed).

| ID | Module / scenario | Expected | Actual result | Status | Evidence / command |
| --- | --- | --- | --- | --- | --- |
| H01 | Combined suite | No failures; only the RUN_DB_TESTS staging tests skip | 103 tests: 101 passed, 0 failed, 2 skipped (staging-gated) | PASS | npm test |
| H02 | GET query validation | Missing/blank/array/malformed timestamp, impossible dates, no zone, ±14:30/+15:00/`+0800` offsets, 7 fractional digits, trailing newline and SQL text → `Invalid or missing timestamp`; `TP-001`, injection and smuggled `&select=` ids → `Invalid testPointId`; missing/empty/unknown/array `field` → `Invalid or missing field`; unknown parameter rejected; `limit` 0/1001/-1/01/10.5/empty and `offset` -1/10000000/1e3/00/smuggled `&` rejected; offsets normalised to the same UTC instant; UTC `Z` output | 66 PHP cases pass (includes `field` required and `limit`/`offset` cases) | PASS | tests/php/read-query-validation.php (via tests/readings-get-api.test.js) |
| H03 | GET HTTP contract | 200 JSON array with numeric `value` and ISO `timestamp` (with required `field`, no `testPointId`); `testPointId`/`field` filters; 12.5 stays a number; two test points at one instant both returned in a fixed order (repeatable); no match → 200 `[]`; exact 400 body `{"message":"Invalid or missing timestamp"}` for 10 bad requests | Observed | PASS (stub) | tests/readings-get-api.test.js |
| H04 | GET security | No/invalid token 401; inactive or role-less account 403; plain HTTP 403; flag off 503; invalid filters never query readings; DB errors return 500/503 without details; a full 1,000-row default page is returned with a `Link` rel=next, not refused or truncated; non-numeric stored value → 500 | Observed | PASS (stub) | tests/readings-get-api.test.js |
| H05 | GET is read-only | Only GET requests reach Supabase, never `/rpc/`; caller's token and publishable key only | Observed for every stub request in the run | PASS (stub) | tests/readings-get-api.test.js |
| H06 | POST unchanged | 201 path, validation, scope, limits, error mapping unchanged; unsupported method (PUT) → 405 with `Allow: GET, POST` | 56 POST PHP cases, existing HTTP test and 29/29 demo scenarios pass | PASS (stub) | tests/week9-api.test.js; npm run demo:api |
| H07 | PHP syntax | All app and test PHP parses | 28 files under `www/` and `tests/php/`: no syntax errors | PASS | php -l |
| H08 | `/api/readings` alias (PHP) | `/api/readings` and `/api/readings/` give the same status and body as v1 for 7 requests (match, filters, no match, missing timestamp, invalid field, no token, inactive account); exact client 400 body; POST/PUT/DELETE/PATCH → 405 `Allow: GET` with no Supabase call | Observed | PASS (stub) | tests/readings-get-api.test.js |
| H09 | `/api/readings` alias (real Apache `.htaccess`) | Rewrite without redirect, query string kept, only GET | XAMPP Apache 2.4 + mod_php, temporary loopback config, real `www/.htaccess`, fake Supabase: alias, alias with slash and v1 GET all 200 with the same body, no `Location`; `+08:00` with filters → voltage 12.5; no match `[]`; missing timestamp 400 exact body; missing field 400; `limit=1` gives `Link` on `/api/readings` and the next page returns the second row; no token 401; alias POST 405 `Allow: GET`; v1 POST still 503 `ingestion_disabled` (flag off); v1 PUT 405 `Allow: GET, POST`; `/api/readingsx` 404; only GET calls reached Supabase | PASS (local, one-off) | Temporary script outside the repo; not part of npm test |
| H10 | GET paging and required `field` | `limit=1` → first row + `Link: </api/v1/readings/?…&limit=1&offset=1>; rel="next"`; following it → second row, no Link; exactly `limit` rows → no Link; past the end → `[]`; pages concatenate to the full result; alias links stay on `/api/readings`; request without `field` → 400 `Invalid or missing field` before any data query | Observed | PASS (stub) | tests/readings-get-api.test.js |
| H11 | Post-deploy smoke script | `npm run smoke:readings`: 11 read-only checks (GET both paths, paging, 400/401, alias 405, POST contract without writing) | Dry run against the local endpoint + fake Supabase (sign-in, lookup, sign-out): 11/11 passed | PASS (dry run, stub) | scripts/api/smoke-readings-get.js; docs/handoff/live-release.md §7 |
| D05 | GET on the real staging database (PostgREST embed, RLS, timestamp equality, paging, alias, no writes) | `RUN_DB_TESTS=1 npm run test:db`, suite "Readings GET API returns real staging readings (read-only)"; then readings-api.md checklist sections 0–5 on a staging web host if one exists | **Not run, 4 Nov:** this machine has no staging `.env` and CI holds no staging secrets. Suite written and syntax-checked; its timestamp helpers were checked locally (4 cases) | NOT RUN (blocked: access) | docs/handoff/live-release.md §2 |
| L01 | Pre-release verification of the branch for live (4 Nov) | All local gates green on the release candidate | `npm test` 104: 101 pass, 0 fail, 3 skip (staging-gated); `php -l` 28 files; `node --check` 91 tracked JS files; validators 56 + 66; `demo:api` 29/29; smoke dry run 11/11; `npm audit` 0 vulnerabilities; config defaults point at the live project; no service-role key under `www/` | PASS (local) | docs/handoff/live-release.md §2 |
| L02 | Live release | docs/handoff/live-release.md §2–§7 by the person with live access | Not run: no live/staging access from the author machine | NOT RUN | Alex or his delegate |

## Update — 29 October 2026 (go-live preparation, Super Admin)

| ID | Module / scenario | Expected | Actual result | Status | Evidence / command |
| --- | --- | --- | --- | --- | --- |
| G01 | Combined suite | No failures with PHP installed; only the RUN_DB_TESTS staging tests skip | 95 passed, 0 failed, 2 skipped (staging) | PASS | npm.cmd test (XAMPP PHP 8.2.12) |
| G02 | API validation | Current/voltage accepted in range; power, future (>5 min), pre-2000, out-of-range and ±14:30 offsets rejected; upper-case IDs normalised | 56 PHP cases pass | PASS | tests/php/reading-validation.php |
| G03 | HTTP API | Request ID header; upper-case ID matches scope; current/voltage forwarded; future/implausible/power rejected before RPC; misconfigured scope → 503 | Observed | PASS (stub) | tests/week9-api.test.js; readable demo of 29 scenarios: npm run demo:api |
| G04 | PHP vs SQL limits | `APP_SETTINGS['ingestion']` equals `ingest_reading_v1` ranges; migration requires #134 | Observed | PASS (source) | tests/readings-api-limits.test.js |
| G05 | Super Admin rules (confirmed 28 Oct) | Admins manage engineers; only the Super Admin manages Admins; Super Admin assigned by the database owner only; no direct users writes (R12); browser and Edge Function rules identical | 10 tests pass | PASS (logic/source) | tests/user-permissions.test.js |
| G06 | Toast output encoding | Messages rendered with textContent | Fixed (was innerHTML) | PASS | tests/week9-output.test.js |
| G07 | Dependency audit | No high/critical | 0 vulnerabilities | PASS | npm.cmd audit (supersedes Q04) |
| G08 | Staging DB, Edge Function, browser UAT | All phases of docs/handoff/super-admin-and-readings-api.md; RUN_DB_TESTS=1 npm run test:db green | **3 Nov, Alex on staging:** all 8 migrations applied to an empty staging project (history matches, no repair needed); both `supabase/queries/*_staging_checks.sql` all ok; `manage-users` deployed; `test:db` 18 passed, 0 failed, 1 skipped (no stationary test point set). test:db found deletes logged with `changed_by` null, fixed by `20261103090000`. Browser check as Super Admin passed; it found the Edit form showing "Admin" and a disabled own-row Deactivate, fixed in `dacc045`. **Not run:** plain Admin and Engineer browser views (covered by G05 and test:db), and the Readings API HTTP cases 1–8 + no-token (Phase 5) | PARTIAL: Super Admin PASS, Readings API HTTP pending | `RUN_DB_TESTS=1 npm run test:db`; Phase 4 screenshots in the PR |
| G09 | Hosted CI and branch protection | Three checks green; ruleset active on default branch | **3 Nov:** ruleset "Protect Main Branch" exists but its enforcement is **disabled**, and `main` has no branch protection. CI results are on the PR | FAIL (ruleset off) | `gh api repos/heyalexahh/ICT2114_ITP_SE_Team_24/rulesets` |

Commands on this Windows host:

```powershell
npm.cmd test
node --test tests/week9-api.test.js tests/week9-output.test.js
& 'C:\xampp\php\php.exe' tests/php/reading-validation.php
Get-ChildItem www,tests/php -Recurse -Filter *.php | ForEach-Object { & 'C:\xampp\php\php.exe' -l $_.FullName; if ($LASTEXITCODE) { throw 'PHP lint failed' } }
git ls-files '*.js' | ForEach-Object { node --check $_; if ($LASTEXITCODE) { throw 'JS syntax failed' } }
npm.cmd audit --json
git diff --check
```

Set `PHP_BINARY` if PHP is outside PATH/XAMPP. PHP 8.1+ and cURL are required. In local environments without PHP, the two API tests report skipped; in CI missing PHP is a hard failure.

| ID | Module / scenario | Expected | Actual result | Status | Evidence / command |
| --- | --- | --- | --- | --- | --- |
| B01 | Before edits, baseline | Existing suite green | 74 passed, 0 failed | PASS | npm.cmd test before first edit |
| B02 | Initial npm invocation | Tests run | PowerShell blocked npm.ps1; npm.cmd works | RESOLVED | First baseline invocation; no execution-policy change |
| U01 | API validation | Required fields, valid object and optional null/bounds accepted | 30 PHP cases pass including negative temperature and pH bounds | PASS | tests/php/reading-validation.php via Node test |
| U02 | Injection / malformed readings | Reject SQL/XSS UUIDs, numeric strings/bools, integer overflow, invalid calendars/timezones, unknown/power fields | Rejected | PASS | Same 30 cases |
| A01 | HTTP valid ingestion | Forward validated body to fixed RPC and return 201 | Correct request and fictional reading UUID | PASS (stub) | tests/week9-api.test.js |
| A02 | Authentication and scope | Invalid token 401; out-of-scope point 403; no write RPC | Observed; invalid requests never increment stub write count | PASS (stub) | tests/week9-api.test.js |
| A03 | Method / JSON / size / batch | 405 / 400 / 413 / 422 before write; media type 415 | Observed | PASS | tests/week9-api.test.js |
| A04 | Duplicate / retries | 23505 maps to 409 consistently | Two repeated stub conflicts return 409 | PASS (mapping only) | tests/week9-api.test.js |
| A05 | DB errors / rate limit | 403/422/429/500 with safe messages; Retry-After | Observed; raw internal message absent | PASS (stub) | tests/week9-api.test.js |
| S01 | API and public-page headers / session CSRF | Headers; CSRF and session input checks | Verified locally, including disabled/insecure API and oversized/invalid session payloads | PASS | tests/week9-api.test.js; router models TLS termination for API |
| S02 | XSS rendering | Strings remain escaped/text in profile/history/notifications | Three executable tests pass | PASS | tests/week9-output.test.js |
| R01 | Existing status/aggregation/auth/chart/filter/navigation tests | Existing tests pass | All original 74 remain green | PASS (test scope only) | npm.cmd test |
| Q01 | Combined suite | No failures/skips with PHP installed | 79 passed, 0 failed, 0 skipped | PASS | npm.cmd test |
| Q02 | PHP syntax | All app/test PHP parses | 26 files pass | PASS | PHP lint command above |
| Q03 | JS syntax / whitespace | Tracked scripts and new JS tests parse; clean diff formatting | All parse; no whitespace errors | PASS | node --check / git diff --check |
| Q04 | Dependency security | No high/critical findings | 1 high dependency: XLSX, two advisories; no npm fixAvailable | FAIL (pre-existing) | npm.cmd audit --json; registry query required network approval |
| Q05 | Workflow / Dependabot YAML | Parse and verify branches, jobs, permissions, immutable pins | PyYAML 6.0.3 parsed both files and assertions passed | PASS (syntax/config only) | Temporary parser outside repo; reproduction below |
| Q06 | Hosted CI / actionlint / Gitleaks | Green checks, valid action semantics, no secret findings | actionlint/Gitleaks unavailable locally; hosted run not performed | NOT RUN | Owner runs configured CI; no hosted success claimed |
| D01 | Real DB authorization | Inactive/wrong role/unassigned/missing/inactive point denied incl. direct RPC | No isolated staging connection/schema provided | BLOCKED | Owner staging steps below |
| D02 | DB transaction and concurrent API retry | One write; failure rolls back reading, batch and summaries | SQL source prepared; no real DB execution | BLOCKED | Owner staging steps below |
| D03 | API → batches → summaries → dashboard/TP/trends | Same Singapore dates and classification as manual/Excel | No DB/browser integration run | BLOCKED | Owner staging steps below |
| D04 | Mixed API/manual/Excel duplicate concurrency | No inconsistent data | Old paths do not acquire new locks; unresolved risk | BLOCKED | Requires DB-wide strategy and staging concurrency test |
| R02 | Browser Excel import/export round trip, CRUD, search/filter/pagination, charts | Existing workflows function under deployed headers | No browser/Apache staging session supplied | NOT RUN | Manual UAT needed; no Excel implementation replaced |
| S03 | Real pages/TLS/proxy headers/cookies/CSP | Correct deployment and asset compatibility | API header tests only; deployment not examined | NOT RUN | Apache/HTTPS curl + browser checklist below |

An initial local HTTP size test failed because XAMPP displayed a PHP startup temp-directory notice, causing a 200 response before headers. With production startup settings (`display_errors=0`, `display_startup_errors=0`) the response is 413 and all HTTP tests pass. Deployment must apply those settings outside application code.

YAML parsing reproduction (in a tooling environment with PyYAML 6.0.3 installed):

```sh
python -c "import yaml; w=yaml.load(open('.github/workflows/ci.yml'),Loader=yaml.BaseLoader); d=yaml.safe_load(open('.github/dependabot.yml')); assert w['on']['push']['branches']==['sprint-9-owen']; assert set(w['jobs'])=={'validation','dependency-audit','secrets'}; assert d['version']==2; print('YAML checks passed')"
```

## Staging integration and UAT procedure — not executed

Owner only, with `RUN_DB_TESTS=1` for any future automated DB harness; explicitly target isolated staging, never live. There is currently no automated DB harness or complete schema fixture, so do not interpret this flag as running these checks.

1. Record staging URL/DB identity, migration versions, complete function definitions/grants/policies, and cleanup owner. Create synthetic active/inactive users, assigned/unassigned engineers and stationary/variable points using the existing supported administration flow. Record IDs in an untracked fixture manifest; never reuse customer rows.
2. Keep ingestion disabled; apply migration, verify anonymous EXECUTE denied and authenticated direct RPC active/role/assignment checks. Configure the dedicated account's exact PHP scope; enable staging only.
3. Post -850, -851, -849 mV records at nonoverlapping timestamps around Singapore midnight/week boundaries. Compare test_point_readings and reading_batches counts/fields, threshold snapshot/is_protected, daily/weekly rows and dashboard/TP/history/trend values. Compare equivalent manual and synthetic Excel readings through their normal UI paths.
4. Retry identical and altered payloads at the same timestamp, at ±59/60/61 seconds, and concurrently from two clients. Check the actual helper's boundary inclusion; document results. Verify all invalid/unauthorized requests leave counts unchanged. Force a controlled summary-function failure **only in disposable staging**, confirm batch/reading/summary rollback, then restore it.
5. Exercise 60 writes in a minute for the synthetic account and verify the next write is 429. Check rate-window expiry and mixed-path counts; confirm gateway limits also cover failures.
6. On Apache/HTTPS, `curl -I` public/protected pages and inspect POST API headers, HSTS opt-in, cookie Secure/HttpOnly/SameSite, 403/404 on dotfiles/private files, auth/recovery, chart/maps/CDN console reports and spreadsheet import/export, CRUD/filter/search/pagination. Do not enforce report-only CSP until compatibility passes.
7. Delete only fixture IDs listed in the manifest via owner-approved cleanup; ensure no unrelated data changes. Record expected/actual values and screenshots/query output with no tokens/customer data. Disable API and apply the new RPC rollback if validation fails.
