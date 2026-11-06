# ITP 2 Implementation Plan — Corrosion Protection Monitoring Web Application

**Project:** SE_16 Development of Corrosion Protection Management and Monitoring Web Application  
**Team:** SIT ICT2114 SE Team 24 · **Client:** Newcastle University in Singapore  
**Repo:** `github.com/heyalexahh/ICT2114_ITP_SE_Team_24` · **Supabase project:** `pscwapylbjvulvsszdur` ("Corrosion monitor", ap-south-1)  
**Prepared:** 1 Oct 2026 (Sprint 8), schedule revised 28 Oct · **Development stops:** 6 Nov 2026 · **Client meeting:** 13 Nov 2026 · **Final report:** 22 Nov 2026

This plan is written for Claude Code. Read `CLAUDE.md` (repo root) first for repo conventions, and the current sprint file in `docs/sprints/` for this sprint's owners, order and definition of done. Work through the phases in order unless told otherwise; each task names its GitHub issue, owner, files, steps and acceptance checks. Where a sprint file is more specific than this plan, the sprint file wins for that sprint.

---

## 1. Context and intended outcome

### 1.1 The problem

Cathodic protection engineers check whether metal assets are protected from corrosion by measuring the potential at **test points**. A reading more negative than −850 mV means the point is protected. Today the client's records are spreadsheets from monitoring equipment (for example one site, "Jalan Ban", logs 4 test points plus temperature, conductivity, pH, dissolved oxygen and rectifier power every minute). The application centralises these readings, shows protection status and trends, and helps engineers find locations and test points that need attention.

### 1.2 Users

- **Corrosion engineers** (`corrosion_engineer`): monitor dashboards, weekly summaries, history, maps; enter individual readings; edit their own reading within 1 hour.
- **Administrators** (`admin`): everything engineers can do, plus manage users, locations, test points, coordinates, equipment versions and bulk imports.
- The client representative (Zhen Qi) relays engineer needs, reviews deliverables and records acceptance. Engineers take part in face-to-face usability testing on **19–23 Oct**.

### 1.3 What ITP 1 delivered (baseline)

Sign-in with Supabase Auth plus a PHP session gate; Admin/Engineer roles with RLS; locations, test points, reading batches and readings in Postgres; manual entry with a 1-minute duplicate guard; per-test-point spreadsheet import/export; protection status (Protected / Unprotected / Warning / No Data); raw/daily/weekly history and environmental charts; location-first weekly summary with stored daily/weekly summaries refreshed by triggers + pg_cron; configurable dashboard; Google Maps asset map with clustering and 4 coordinate modes (gps / relative / gps_and_relative / unmapped) and position history; equipment version tracking; 26 unit-test files (`node --test`).

### 1.4 ITP 2 objective

Stabilise, secure, validate and prepare the prototype for controlled release and client handover, while delivering the client's specific requests: representative client data, current/voltage measurements and a relative test-point view. Priority order (from the Scope of Work):

1. Release-critical security, access-control, session and data-integrity fixes
2. Client data integration and current/voltage/coordinate requirements
3. Validation of usability, access control, imports and performance
4. Defect correction from client and engineer testing
5. Deployment, rollback, user and handover documentation

### 1.5 The five client-facing deliverables and how they are judged

| # | Deliverable | Outcome the client sees | Acceptance evidence (Scope of Work, App. B) |
|---|---|---|---|
| D1 | Security and controlled access | Email password recovery; verified password change; working Remember Me; safer sessions; role-restricted access | B1 recovery/password/Remember Me test records · B2 sign-in/out, expiry, deactivated account · B3 approved access matrix with allowed/denied tests · B4 security findings and fixes |
| D2 | Client data and electrical measurements | Current and voltage across entry, import, history and export; a representative client sample imported with rejected/duplicate rows reported; repeatable import instructions | B5 matched records across entry/DB/history/export · B6 import counts and rejected-row reasons · B7 source-to-DB reconciliation, template, instructions |
| D3 | Pipeline and test-point visualisation | GPS map kept; lightweight 2D relative X/Y view; Z labelled once defined; click through to test-point details | B8 positions match agreed coordinates/drawing · B9 engineers can navigate map → details |
| D4 | Usability and acceptance | Task-based engineer testing; prioritised fixes; client disposition per deliverable | B10 task results, findings log, fixes, client disposition |
| D5 | Scalability and release readiness | Key workflows tested with ≥100 test points at a location and long histories; release, update, recovery, user and import guides | B11 dataset, conditions, timings, limits · B12 checked procedures, release notes, handover checklist |

### 1.6 Definition of done for ITP 2 (code complete when development stops on 6 Nov; accepted at the 13 Nov client meeting)

- All Phase 0–7 tasks merged to `development`, release candidate merged to `main` and tagged `v2.0.0-rc1` (final `v2.0.0` in Sprint 14).
- Supabase security advisor shows no WARN items for exposed SECURITY DEFINER functions or mutable search paths; every table has RLS with explicit policies.
- The database can be rebuilt from `supabase/migrations/` on an empty project (verified once with a local `supabase db reset` and by building the staging project from the migrations).
- The Jalan Ban sample can be imported through the app with a reconciliation report showing 0 unexplained differences.
- Current/voltage visible end-to-end (entry, history, export) for the test point types and level the client confirms (D-MEAS-1); units come from one config file.
- Relative schematic shows a location's test points by X/Y and links to their detail pages.
- `npm test` passes in CI on every PR; `main` is protected.
- Performance results recorded for a location with ≥100 test points and ≥90 days of readings.
- Docs in `docs/` cover architecture, database, API, deployment/rollback, import, user manual, test report and release notes.

### 1.7 Out of scope (do not build unless the plan is updated)

Automatic/real-time ingestion from equipment; migrating all historical client data; predictive analytics/ML; interactive 3D pipeline models; image upload/field-observation modules from the original brief (client marked images "won't have"); a framework rewrite.

---

## 2. Current state (verified 1 Oct 2026)

### 2.1 Repository

- Branches: `main` (last merge PR #132, 25 Jul), `development`, `Sprint-8` (created from `development` on 1 Oct; same content as `main`), `sprint-5` (**5 commits not in `main` or `Sprint-8`**: record-limit change, bug fix, export button removal), plus old sprint branches. No ITP 2 commits yet.
- No CI (`.github/` absent), no branch protection, no releases.
- `.gitignore` ignores `docs/`, `data/`, all of `supabase/*` except 7 whitelisted SQL files, and `supabase/functions` — so the Edge Function and most of the schema are **not in git**.

### 2.2 Database (live)

Tables: `users`, `locations`, `test_points`, `reading_batches`, `test_point_readings`, `daily_summaries`, `weekly_summaries`, `summary_refresh_queue`, `test_point_positions`, `test_point_equipment_versions`, `dashboard_layouts`, view `v_readings`, plus backup tables `backup_jalanban_reading_batches` (45,387 rows), `backup_jalanban_test_point_readings` (181,548), `v_readings_backup_table`.

Key columns:
- `reading_batches`: id, location_id, reading_ts, entered_by, upload_method (`manual|bulk|sensor`), temperature_c, medium_conductivity, ph, dissolved_oxygen, power_watts, source_file, created_at. **No current/voltage.**
- `test_point_readings`: id, batch_id, test_point_id, value_mv, threshold_mv_snapshot, is_protected, created_at; unique (batch_id, test_point_id).
- `test_points`: id, location_id, label (unique per location), type (`stationary|variable`), threshold_mv, status, is_active, assigned_engineer_id, latitude, longitude, test_point_code (globally unique), note, current_equipment_version_id.
- `test_point_positions`: coordinate_mode, latitude, longitude, relative_x_m, relative_y_m, relative_z_m, chainage_m, coordinate_accuracy_m, coordinate_source, is_current, valid_from/valid_to (one current row per test point).
- `users`: id, full_name, email, role (`admin|corrosion_engineer`), is_active, created_at, created_by.

Summaries: triggers on `test_point_readings` and `reading_batches` enqueue `(test_point_id, date)` into `summary_refresh_queue`; pg_cron runs `process_summary_refresh_queue(500)` every 10 min and `(1000)` daily at 00:10 SGT.

Only 3 migrations are recorded in the database (`grant_authenticated_daily_summary_read`, `scope_available_weeks_to_active_test_points`, `optimize_active_user_read_policies`); everything else was created in the SQL editor.

Edge Function `manage-users` (create/update/delete users with the service role) is deployed but not in the repo.

### 2.3 Known defects and risks to fix (from the 1 Oct review)

| ID | Finding | Fixed in |
|---|---|---|
| R1 | `anon` can execute SECURITY DEFINER functions with no auth check: `backfill_daily_and_weekly_summaries`, `refresh_daily_summary`, `refresh_weekly_summary`, `process_summary_refresh_queue`, `queue_summary_refresh`, trigger fns, `rls_auto_enable`. 6 functions have mutable search_path. | 1.1 |
| R2 | `is_admin()` checks role but not `is_active`; `manage-users` checks role but not `is_active`; deactivation doesn't revoke sessions; no server-side self-demotion guard; role not validated. | 1.1, 1.5 |
| R3 | Import script expects `www/.env` (service-role key) and `www/data/*.xlsx` inside the web root; `npm run import:jalanban` points at a non-existent path. | 0.4 |
| R4 | PHP session: no timeouts, no cookie flags, no re-validation, no CSRF/origin checks on `set-session.php`/`clear-session.php`. | 1.4 |
| R5 | "Forgot password?" links to `#`; "Remember me" not wired; password change has no reauthentication. | 1.2, 1.3 |
| R6 | Stored XSS: `history.js` 974–983 and `notifications.js` 37–43 interpolate DB values into `innerHTML` unescaped. | 5.2 |
| R7 | `xlsx@0.18.5` (known prototype-pollution/ReDoS CVEs) parses user uploads; CDN scripts unpinned and without SRI; dead `www/js/dist/login.dev.js`. | 5.3 |
| R8 | Schema not reproducible from repo; Edge Function not versioned. | 0.2, 0.3 |
| R9 | Conductivity is labelled mS/cm (agreed in July), but the stored Jalan Ban values (196–32,293) look high for that unit; client to confirm unit/data. | 2.3, #49 |
| R10 | Readings import is per test point and inserts one row at a time; no preview, no rejected-row report, no traceability; can't take the client's wide multi-test-point file. | Phase 3 |
| R11 | Redundant indexes on `reading_batches` (asc+desc duplicates); history loads raw rows client-side. | 8.3 |

---

## 3. Decision register and provisional defaults

These depend on client confirmation. **Build with the provisional default, read it from one config module, and label it as provisional in the UI where noted.** When the client confirms, only the config (and possibly a small migration) changes.

Create `www/js/config/app-settings.js` (UMD pattern, `window.AppSettings`) and mirror server-side values in `www/php/app-settings.php` where PHP needs them.

| ID | Decision | Provisional default | Config key | Status |
|---|---|---|---|---|
| D-MEAS-1 | Meaning, level and applicability of current/voltage | **Rectifier outputs**, current **A** and voltage **V**, optional, stored on `reading_batches` (once per reading time, like power). The client's updated spreadsheet has `Voltage` and `Current` columns per row. Shown where power is shown (variable test points) unless the client says otherwise | `measurements.current`, `measurements.voltage` | **Confirmed 5 Oct** (placement on batch: team reading of "rectifier outputs") |
| D-MEAS-2 | Power handling | **Calculated: power (W) = voltage × current** when both are present; not entered by hand. Older rows that only have `power_watts` keep their stored value | `measurements.power.mode = "calculated"` | **Confirmed 5 Oct** (reverses the earlier "entered" default) |
| D-MEAS-3 | Conductivity unit | **µS/cm** (matches the stored magnitudes). No conversion of stored values | `measurements.conductivity.unit` | **Confirmed 5 Oct** |
| D-MEAS-4 | Other units | Potential mV, temperature °C, pH unitless, dissolved oxygen mg/L | `measurements.*` | **Confirmed 5 Oct** |
| D-XYZ-1 | Relative coordinates | Client asks the team to **define** the X/Y/Z reference system before implementation. Team proposal (in the #49 reply): origin (0,0,0) at a named reference point per location (e.g. the pipe starting point, client's suggestion of 4 Jun), X and Y in metres, GPS stays the preferred source for mapping | `schematic.units = "m"` | Team to propose, client to confirm |
| D-XYZ-2 | Meaning of Z | `hidden` until the reply is confirmed; raw value shown in tooltip as "Z (unconfirmed)" | `schematic.zMode = "hidden" \| "depth" \| "elevation"` | Team to propose, client to confirm |
| D-ROLE-1 | Super Admin | **Confirmed by the client:** the Super Admin has the same permissions as an Admin and can also manage **Admins and engineers**; Admins manage engineers only and cannot manage Admins; there is **exactly one Super Admin**. Handover: the Super Admin transfers the role in one confirmed step (the new holder becomes Super Admin, the old one becomes Admin); the Super Admin can't be demoted, deactivated or deleted any other way; role changes are logged. Implementation: an `is_super_admin` flag on `admin` accounts (unique: at most one; a trigger keeps exactly one), so existing admin RLS, `require_role('admin')` and the #133 helpers stay unchanged; all user changes go through `manage-users` (closes R12) | — (DB flag) | **Confirmed** (recorded 28 Oct); build in Sprint 9 |
| D-ROLE-2 | Can engineers delete readings? | **No** (current behaviour). Client said yes on 18 May ("add, edit and delete readings"); confirm scope (all vs own recent) before changing | — | Awaiting client |
| D-NOTIF-1 | Notifications | **Approved by the client at UAT (16 Oct): basic in-app notifications stay on** (as built in #147); no email/push | `features.notifications = true` | **Approved** |
| D-SESS-1 | Session timeouts | Idle 30 min; absolute 12 h; Remember Me 14 days | `session.*` (PHP) | Team decision |
| D-ENV-1 | Environmental change indicator | **20% day-to-day** (client, 5 Oct); which parameters (conductivity only, or also pH/temperature/DO) still to confirm, so labelled "provisional" | `environment.*` | Partly confirmed |
| D-IMP-1 | Who can import | Admins only (client, 18 May) | — | Confirmed |
| D-IMP-2 | Timestamps without offset | Interpret as Asia/Singapore | `import.defaultTimeZone` | Confirmed (team) |
| D-IMP-3 | Import template | **Same layout as the client's spreadsheet** (wide: `Time`, `TestPoint1 (mV)` …, `Temp (Degree C)`, `MediumConductivity`, `PH`, `Dissolved Oxygen`, `Voltage`, `Current`, `Power (Watts)`) to minimise operational change | — | **Confirmed 5 Oct** |
| D-TP-1 | Test point replacement | A replacement test point gets a **new identifier**; history is preserved and the original and replacement are linked (also raised 8 May) | — | **Confirmed 5 Oct**; design in Sprint 9/10 |
| D-DATA-1 | Validation dataset | At least **10–15 test points and 2 months** of data; values for the extra points approximated from Jalan Ban points 1–4; layout from the client's 14-point reference drawing | — | **Confirmed 5 Oct** |
| D-UAT-1 | Engineer testing date | Client cannot do 21 Oct; prefers "next week after 4pm" (read as 12–16 Oct) and is then away for a month; will bring a corrosion engineer | — | **Date to confirm urgently** |

Record each confirmation in `docs/decisions.md` (date, who, decision) and update this table.

---

## 4. Conventions for every task

- **Branching:** each sprint has an integration branch from `development` (e.g. `Sprint-8`). Personal branches come off it as `sprint-<n>-<issue>-<owner>-<short-name>`; PRs go into the sprint branch with `Closes #<issue>`. Alex merges the sprint branch into `development`, and into `main` at release. Small PRs (one task each).
- **Done means verified:** merged into the sprint branch with evidence (tests, screenshots or a test record). A task can also end as "submitted for client decision" or "explicitly carried over" with a note on the sprint parent issue.
- **Migrations:** new timestamped files only; never edit an applied migration; never apply to the live project. The PR description must include "Migration to apply: `<file>`" and a rollback snippet.
- **Tests:** pure logic → `tests/*.test.js` with `node:assert/strict`. DB/RLS integration tests → `tests/db/*.test.js`, skipped unless `RUN_DB_TESTS=1`; they run against the staging project (or a local stack) with the test users, never against live. Staging is targeted with `--db-url`, never `supabase link`.
- **UI:** reuse `toast.js`, modal helpers in `common.js`, table/sort helpers, `chart-protection-presentation.js` palette. Every new page uses `session-guard.php` + `require_login()` or `require_role('admin')`.
- **Docs:** each phase adds or updates the relevant file under `docs/`.

---

## 5. Phases and tasks

Dates are the sprint windows from the Scope of Work. Issue numbers are on the GitHub project board.

### Phase 0 — Repository and database baseline (Sprint 8, 21 Sep – 2 Oct; carry into 5–7 Oct if needed)

**0.1 Sync branches** · #136 · Owen  
Steps: on a branch from `Sprint-8` (`sprint-8-136-owen-sync`), merge `main` and then `origin/sprint-5` (resolve conflicts, keep the record-limit change and export-button removal); run `npm test`; PR into `Sprint-8` for Alex to merge; then tell the team they can branch. The fixes reach `development` and `main` through Alex's sprint-end merge.  
Accept: `Sprint-8` contains the 5 `sprint-5` commits; tests pass.

**0.2 Baseline the database into migrations** · #135 · Alex (Claude Code prepares)  
Steps:
1. Fix `.gitignore`: stop ignoring `docs/`; replace the `supabase/*` whitelist with: track `supabase/config.toml`, `supabase/migrations/**`, `supabase/functions/**`, `supabase/seed.sql`, `supabase/tests/**`; keep ignoring `supabase/.temp`, `supabase/.branches`, `.env*` (except `.env.example`), `data/`, `www/data/`, and the `/output/`, `/tmp/` lines that arrive with the `sprint-5` merge.
2. `supabase init` if `config.toml` is missing; `supabase link --project-ref pscwapylbjvulvsszdur` (Alex runs; needs DB password).
3. `supabase db pull` to create the baseline migration from the remote schema (Supabase's existing-project workflow). Review the generated file. Make sure the pg_cron job definitions are captured; if not, add them as `cron.schedule(...)` statements.
4. The baseline must not contain the `backup_jalanban_*` / `v_readings_backup_table` tables (client data copies) or secrets; remove them from the file if pulled.
5. Move the 7 old ad-hoc SQL files to `supabase/legacy-sql/` with a README explaining they are superseded by the baseline.
6. Add `supabase/seed.sql` with **synthetic** locations/test points only and instructions for creating local test users (one admin, one engineer, one inactive engineer).
7. Check `supabase migration list`. `db pull` normally records the baseline as applied on the remote; use `supabase migration repair` only if the list shows a real mismatch, and explain why in the PR.  
Accept: `supabase db reset` on a local stack (Alex's machine; Docker is needed only for `db pull` and this check) reproduces all tables, views, functions, policies, triggers and cron jobs; the same migrations build the empty staging project (7.2); `npm test` passes.

**0.3 Version the Edge Function** · #135 · Alex  
Steps: `supabase functions download manage-users`; commit `supabase/functions/manage-users/index.ts` unchanged first (separate commit), then improvements in task 1.5.  
Accept: function source in git matches deployed version 1.

**0.4 Remove secrets and data from the web root** · #136 · Owen  
Steps: move `www/scripts/import-jalanban.js` to `scripts/legacy/import-jalanban.js` (superseded by Phase 3), load `.env` from repo root, fix the `package.json` script path; delete `www/js/dist/login.dev.js`; add `www/.htaccess` that denies dotfiles, `*.md`, `*.sql`, `*.xlsx`, `*.csv`, `/scripts`, `/data`, `/node_modules`; add `.env.example` at repo root (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_BASE_URL`).  
Accept: nothing under `www/` reads `.env` or client files; `curl http://localhost/.env` returns 403/404.

**0.5 CI** · #136 · Owen  
Create `.github/workflows/ci.yml` on PRs into and pushes to `Sprint-*`, `development` and `main`: Node 20, `npm ci`, `npm test`; `php -l` on every `.php` file; gitleaks secret scan; `npm audit --audit-level=high` (report only until 5.3 lands). Document in `docs/contributing.md` the branching model and the branch protection settings Alex must enable on `main`, `development` and the current sprint branch (require PR, require CI, no force push).  
Accept: CI runs green on a PR.

**0.6 Central config** · #135 · Alex  
Create `www/js/config/app-settings.js` with the browser-side keys in §3 and `www/php/app-settings.php` for the server-side ones (`session.*` timeouts); move Supabase URL/publishable key into a single place (`www/js/config/supabase-config.js` + `www/php/config.php` reading from `getenv()` with the current values as fallback). Add `APP_BASE_URL` for auth redirects.  
Accept: no duplicated Supabase URL/key literals across files; tests for config defaults.

### Phase 1 — Security and controlled access (Sprint 8 → finish by 9 Oct) — Deliverable D1

**1.1 Lock down database functions and policies** · #133 · Gabriel  
Migration `..._harden_function_privileges.sql`:
- `alter default privileges in schema public revoke execute on functions from public, anon;`
- `revoke execute on function <fn> from public, anon, authenticated;` for maintenance/trigger functions: `backfill_daily_and_weekly_summaries`, `process_summary_refresh_queue`, `queue_summary_refresh`, `queue_summary_refresh_for_batch_timestamp_change`, `queue_summary_refresh_for_reading_change`, `refresh_daily_summary`, `refresh_weekly_summary`, `rls_auto_enable`, `set_test_point_positions_updated_at`. (pg_cron runs as `postgres`, triggers do not need EXECUTE for the caller.)
- `revoke ... from public, anon; grant execute ... to authenticated` for app RPCs: `create_manual_reading`, `update_manual_reading`, `check_recent_reading_exists`, `compare_weekly_summaries`, `get_asset_map_points`, `get_test_point_daily_summaries` (both overloads), `get_test_point_weekly_summaries` (both), `get_weekly_summary_available_weeks`, `get_test_point_position_history`, `set_test_point_position`, `is_admin`, `current_user_is_admin`, `current_user_is_active`, `summary_is_engineer_or_admin`, `summary_week_start`.
- Review each function individually and grant execute only to the roles that need that exact function. For `SECURITY DEFINER` functions set `search_path = ''` and schema-qualify all references (`public.users`, `auth.uid()`), as Supabase recommends; where that isn't feasible in time, use `public, pg_temp` and log a follow-up. Invoker functions also get an explicit search_path.
- Redefine `is_admin()` and `current_user_is_admin()` to also require `is_active = true`.
- Change policy "Users read own profile" from role `public` to `authenticated`.
- Add RLS policies to the backup tables (admin read only) or drop them after Alex confirms the data is no longer needed.  
Tests: `tests/db/function-privileges.test.js` — as anon, every RPC above returns 401/permission denied; as engineer, maintenance functions are denied.  
Accept: Supabase security advisor (after Alex applies) has no `anon_security_definer_function_executable`, `authenticated_security_definer_function_executable` for maintenance functions, or `function_search_path_mutable` findings.

**1.2 Password recovery and verified password change** · #46 · Gabriel (UI with Bryce)  
- `www/forgot-password.php` (public): email field → `appSupabase.auth.resetPasswordForEmail(email, { redirectTo: APP_BASE_URL + '/reset-password.php' })`. Always show the same neutral message ("If an account exists, we've sent a link"). Basic client-side rate limit (disable button 60 s).
- `www/reset-password.php` (public): supabase-js picks up the recovery session from the URL; listen for `PASSWORD_RECOVERY`; form for new password + confirm (min 8 chars, same `validatePassword` as settings); `auth.updateUser({ password })`; then `signOut({ scope: 'global' })`, clear PHP session, redirect to `index.php?reset=1`. Handle expired/invalid link with a clear message and link back to forgot-password.
- Wire `index.php` "Forgot password?" to `forgot-password.php`.
- Settings password change (`www/js/settings.js` `bindPasswordForm`): two steps — "Send verification code" → `auth.reauthenticate()` (emails a code) → user enters code + new password → `auth.updateUser({ password, nonce })` → `signOut({ scope: 'others' })` → success toast. Always require the code: Supabase's "Secure password change" alone only asks for reauthentication when the last sign-in is older than 24 h, so test with both a fresh and a >24 h session. Signing out others revokes their refresh tokens, but issued JWTs stay valid until expiry (default 1 h); record what the app blocks in that window.
- Document required Supabase dashboard settings in `docs/security/auth-configuration.md`: Site URL, Redirect URLs (localhost + production), "Secure password change" on, password min length 8, email templates (recovery, reauthentication), custom SMTP recommendation (built-in email is rate-limited), leaked password protection if the plan allows.  
Accept (B1): recovery succeeds; invalid/expired link handled; unknown email shows neutral message; password change requires the emailed code; other sessions signed out.

**1.3 Remember Me** · #47 · Bryce  
- In `supabaseClient.js`, create the client with a storage adapter: if `localStorage['cpm.rememberMe'] === '1'` use `localStorage`, else `sessionStorage` (so the Supabase session ends with the browser session). `removeItem` clears both.
- `login.js`: read the checkbox (give it `id="rememberMe"`), set the flag **before** `signInWithPassword`, send `remember: true|false` to `set-session.php`.
- PHP (with 1.4): remember → persistent session cookie with 14-day lifetime and 14-day absolute limit; otherwise browser-session cookie and 12-hour absolute limit.  
Accept: unchecked → closing the browser requires login again; checked → still signed in after restart within 14 days; logout clears both.

**1.4 PHP session hardening** · #48 · Gabriel  
- New `www/php/session-bootstrap.php` included by `session-guard.php`: `session.use_strict_mode=1`, `use_only_cookies=1`, `cookie_httponly=1`, `cookie_samesite=Lax`, `cookie_secure` when HTTPS, custom name `CPMSESSID`; security headers (shared with 5.1).
- `require_login()`: enforce idle (30 min) and absolute (12 h / 14 d) timeouts from `$_SESSION['last_activity']`/`['created_at']`; regenerate the ID every 15 min; every 5 min re-verify the stored access token and profile (`/auth/v1/user` + `users?select=role,is_active`) and destroy the session if invalid, inactive or role changed.
- `set-session.php`: accept `mode: "login" | "refresh"`; on **both** modes verify the token with Supabase (`/auth/v1/user`) and reload `role`/`is_active` server-side before creating or updating the session (never trust identity, role or expiry from the browser; `remember` is a preference the server caps); store access token + expiry; CSRF protection: POST only, same-origin `Origin`/`Sec-Fetch-Site` check plus a CSRF token or required custom header; require `Content-Type: application/json`.
- `common.js`: subscribe to `onAuthStateChange` and post `TOKEN_REFRESHED` tokens to `set-session.php` (mode refresh); on `SIGNED_OUT` call `clear-session.php`.
- `clear-session.php`: POST only, same-origin check.
- Expired session on an API-style request returns 401 JSON; on a page, redirect to `index.php?expired=1` with a message.  
Accept (B2): idle and absolute expiry work; deactivating a user ends their PHP session within 5 min and Supabase refresh fails (with 1.5); CSRF-style cross-origin POST to `set-session.php` is rejected.

**1.5 Access matrix, user management hardening and RLS tests** · #49 (Alex, with client) + #133 (Gabriel)  
- Write `docs/security/access-matrix.md`: rows = actions (view dashboard/history/maps, create reading, edit own reading <1 h, edit others' readings, delete readings, import readings, manage test points/locations/positions/equipment, manage users, view audit/import runs), columns = Engineer / Admin / (Super Admin — not approved). Fill with current behaviour; mark D-ROLE-1/2 as pending client confirmation. Alex sends it to the client.
- `manage-users` function: require caller `is_active`; validate `role ∈ {admin, corrosion_engineer}` and email format; forbid self-demotion and self-deactivation server-side; on deactivate call `auth.admin.updateUserById(id, { ban_duration: '876000h' })`, on reactivate `ban_duration: 'none'`; restrict CORS `Access-Control-Allow-Origin` to `APP_ORIGIN` env; return JSON errors consistently; keep "delete" but require a confirm flag and prevent deleting yourself.
- `tests/db/rls-matrix.test.js` (gated): sign in as admin, engineer, inactive engineer and anon against staging and assert each allowed/denied action in the matrix (select/insert/update/delete per table, RPC calls). Output a Markdown table to `docs/testing/rls-matrix-results.md` for evidence (B3).  
Accept: matrix doc exists; test produces the results table with no unexpected allows.

### Phase 2 — Electrical measurements (Sprint 8 schema → Sprint 9 UI) — Deliverable D2

**2.1 Schema** · #134 · Gabriel  
Migration `..._add_current_voltage.sql`:
- Nullable `current_a` and `voltage_v` columns **on `reading_batches`** (rectifier outputs, once per reading time; D-MEAS-1, confirmed 5 Oct) with range checks and column comments giving the units.
- **Power is calculated (D-MEAS-2):** when both current and voltage are present, `power_watts = current_a * voltage_v`, set in the database (trigger or inside the RPCs) so no client or import can store a different value. Rows with only `power_watts` (older data) keep it.
- Recreate `v_readings` to include both columns.
- New versions of `create_manual_reading` and `update_manual_reading` with `p_current_a numeric default null, p_voltage_v numeric default null` (drop the old signatures in the same migration and update grants per 1.1). `p_power_watts` is ignored when current and voltage are given.
- Tested on staging; Alex applies after review.  
Accept: existing manual entry still works; new params stored; power equals V × I; `npm test` passes.

**2.2 UI and data paths** · #81 · Bryce  
- Manual entry/edit (`testpoint-update.php/js`): Current (A) and Voltage (V) fields where Power is shown today (variable test points); Power becomes a read-only calculated value (V × I) (D-MEAS-1/2).
- Test point detail (`testpoint-view.js`): latest values cards; add current/voltage series to the electrical/environment charts; history table columns.
- History page (`history.js`): columns, CSV export columns with units in headers.
- Spreadsheet export (`testpoints.js` / detail export) and reading import template: add `Current (A)`, `Voltage (V)`.
- Repository layer (`supabase-repositories.js`): select and map `current_a`, `voltage_v`.
- All labels/units/decimals come from `AppSettings.measurements`.  
Tests: mapping/formatting functions; export header builder.  
Accept (B5): a reading entered with I/V appears identically in detail, history, CSV and xlsx export.

**2.3 Conductivity label** · #81 · Bryce  
Replace hard-coded `mS/cm` (`history.js` line 14, detail page, templates, import header constant) with `AppSettings.measurements.conductivity.unit` (default stays mS/cm until the client answers D-MEAS-3).  
Accept: no hard-coded conductivity unit strings remain outside the config.

### Phase 3 — Client data import with traceability (Sprint 9, 5–16 Oct) — Deliverable D2

Goal: an Admin can import the client's spreadsheet (wide format like Jalan Ban, or long format), preview and validate it, see rejected and duplicate rows with reasons, import valid rows quickly and safely, and produce a reconciliation report. Must be demo-ready for 19 Oct.

**3.1 Database support** · #82 · Gabriel  
Migration `..._import_runs.sql`:
- Table `import_runs`: id uuid pk, location_id fk, source_file_name text, source_sha256 text, source_format text (`wide|long`), column_mapping jsonb, status text (`previewed|running|completed|failed|rolled_back`), total_rows int, valid_rows int, inserted_batches int, inserted_readings int, duplicate_rows int, rejected_rows int, rejected_summary jsonb (reason → count), started_by uuid, started_at, finished_at, notes. RLS: admins all; active engineers select.
- `reading_batches` add `import_run_id uuid references import_runs(id) on delete set null`, `source_row_number int`; index on `import_run_id`.
- Unique protection: partial unique index on `reading_batches (location_id, reading_ts) where upload_method = 'bulk'` to make re-imports idempotent (check for conflicts with existing data first and report them in the PR).
- RPC `import_reading_rows(p_import_run_id uuid, p_rows jsonb) returns jsonb` — **security invoker** (RLS applies), admin + active check up front, `search_path` set. Each element: `{row, reading_ts, temperature_c, conductivity, ph, dissolved_oxygen, power_watts, current_a, voltage_v, readings: [{test_point_id, value_mv}]}`. In one transaction per call: skip rows whose (location, reading_ts) already exists or where any reading falls within 1 minute of an existing reading for that test point (report as duplicates), insert batches (`upload_method='bulk'`, `source_file`, `import_run_id`, `source_row_number`) and readings (`threshold_mv_snapshot` from test point). Return `{inserted_batches, inserted_readings, duplicates: [row...], errors: [{row, reason}]}`.
- RPC `finalize_import_run(p_import_run_id)` (security definer with admin/is_active check, search_path set, execute granted to authenticated only): updates counts/status and processes the summary refresh queue for the affected test points so summaries are current without waiting for cron.
- RPC `rollback_import_run(p_import_run_id)` (admin only): deletes that run's batches (cascade readings), sets status `rolled_back`.

**3.2 Parser and validator (pure, tested)** · #82 · Gabriel  
`www/js/import/reading-import-parser.js` (UMD):
- `detectFormat(headers)` → wide (headers like `TestPoint1 (mV)`, `<label> (mV)`) or long (`Test Point`, `Reading (mV)`).
- Header aliases (case/space-insensitive) for Time/Timestamp/Date Time, Temp (Degree C)/Temperature, MediumConductivity/Conductivity, PH/pH, Dissolved Oxygen/DO, Power (Watts), Current (A), Voltage (V).
- `parseTimestamp(value)` accepts Excel serials, JS Dates, ISO 8601 with offset, `DD/MM/YYYY HH:mm[:ss]`; no offset → Asia/Singapore. Reject unparseable and future (> now + 1 day) timestamps.
- `validateRow` → reasons: `missing_timestamp`, `invalid_timestamp`, `missing_reading`, `non_numeric_<field>`, `out_of_range_<field>` (mV −3000…+500; temp −10…80; pH 0…14; conductivity ≥0; DO 0…50; power/current ≥0), `unknown_test_point`, `duplicate_in_file`.
- Required: timestamp and at least one protection reading (client, July). Others optional.
- `toImportPayload(rows, mapping, testPointsByLabel)` → arrays for the RPC, chunked (1,000 rows).
- Tests in `tests/reading-import-parser.test.js` using small fixtures under `tests/fixtures/` (synthetic, same headers as Jalan Ban; **no client data**).

**3.3 Import page** · #82 · Gabriel (UI with Bryce)  
`www/import.php` (`require_role('admin')`) + `www/js/import/import-page.js`, linked from the admin menu and from the location view:
1. Select location; choose `.xlsx/.csv` (≤ 20 MB). Compute SHA-256 (Web Crypto) and warn if a completed run has the same hash.
2. Show detected format and mapping table (auto-matched; admin can change a column or map a wide column to a test point of the location). Unmapped test-point columns block import.
3. Validate in the browser (Web Worker if > 5,000 rows to keep the UI responsive): summary cards (total, valid, rejected by reason, in-file duplicates), first 20 rows preview, "Download rejected rows (CSV)" with row number + reason.
4. Confirm → create `import_runs` (status running) → send chunks sequentially to `import_reading_rows` with a progress bar and cancel button → `finalize_import_run` → result screen with counts and link to the reconciliation report.
- Retire the per-test-point import in `testpoint-view.js` by routing its button to `import.php?location=…&testPoint=…` (long format, single test point) so there is one import path.

**3.4 Reconciliation report** · #82/#83 · Gabriel  
On the result screen and at `import.php?run=<id>`: per test point — rows in file (valid), readings in DB for this run, min/max timestamp in file vs DB, mean mV in file vs DB; 10 random sampled rows compared field by field; export as CSV/Markdown for evidence (B7).  
Accept: importing a synthetic Jalan-Ban-shaped file of 45,000 rows × 4 test points completes in < 5 minutes, reports 0 mismatches; re-importing the same file inserts 0 and reports all rows as duplicates.

**3.5 Template and guide** · #83 · Gabriel  
`docs/guides/import-guide.md`: accepted formats, column names and units, wide vs long example, timestamp rules, duplicates, what each rejection reason means, how to roll back a run, how to repeat an import. "Download template" buttons on the import page for both formats.

### Phase 4 — Relative test-point schematic (Sprint 9) — Deliverable D3 · #84 · Alex

- New "Site schematic" view on `asset-map.php` (tab next to the map) and a link from the location view. Select a location; plot its test points whose current position has `relative_x_m`/`relative_y_m` (modes `relative`, `gps_and_relative`).
- `www/js/schematic/schematic-layout.js` (pure, tested): compute bounds, equal-aspect scale, nice axis ticks in metres, origin marker, label placement with simple collision avoidance (offset candidates), grouping of points closer than 12 px into a numbered cluster.
- `www/js/schematic/schematic-view.js`: inline SVG; markers coloured by status using the existing protection palette; labels show test point label; hover/focus tooltip: label, status, latest mV and time, X/Y (m), Z per `AppSettings.schematic.zMode` ("Z (unconfirmed)" when hidden); click or Enter opens `testpoint-view.php?id=…`; cluster click lists its points. Zoom/pan with buttons, mouse wheel and keyboard; "Reset view". Legend with units and "Schematic, not to survey precision".
- Points without relative coordinates are listed below as "Not positioned" with links to set positions (admins).
- No pipe/line drawing (client: assets are not always pipelines). Optional toggle "connect by chainage" off by default if `chainage_m` exists.
- Data via existing `get_asset_map_points` (already returns relative X/Y/Z); no schema change.  
Tests: layout scale/ticks/clustering/label placement.  
Accept (B8, B9): positions match an agreed coordinate sample within rounding; closely spaced points remain selectable; keyboard accessible; links work.

### Phase 5 — Application security hardening (Sprint 9) — Deliverable D1 · #137 · Owen

**5.1 Security headers** — in `session-bootstrap.php` (pages) and `www/.htaccess` (static): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`, `Permissions-Policy` (geolocation=(), camera=(), microphone=()), HSTS when HTTPS. CSP first as `Content-Security-Policy-Report-Only` allowing self, `cdn.jsdelivr.net`, `cdn.sheetjs.com`, `kit.fontawesome.com`, `ka-f.fontawesome.com`, `maps.googleapis.com`, `maps.gstatic.com`, `*.supabase.co` (connect), then enforce once the console is clean.

**5.2 XSS** — create `www/js/utils/html.js` (`escapeHtml`, `escapeAttr`), load it before page scripts, replace the local copies (`admin.js`, `history.js`, `testpoint-update.js`, `asset-map.js`, others). Fix `history.js` 974–983 and `notifications.js` 37–43. Audit every `innerHTML`/`insertAdjacentHTML` (about 120 sites across 19 files; list them in the PR) and escape or switch to `textContent`. Add `tests/html-escape.test.js` and a CI grep check that flags new unescaped `${…}` inside `innerHTML` template literals (allow-list comment for trusted constants).

**5.3 Dependencies** — SheetJS from `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` (browser) and `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (npm); pin `@supabase/supabase-js` and `chart.js` to exact versions with SRI; make `npm audit --audit-level=high` blocking in CI. Remove unused deps.

**5.4 Input handling** — server-side: `set-session.php` validates JSON shape; all RPCs validate numeric ranges (mirrors 3.2). Error messages shown to users never include stack traces or SQL text.

Accept (B4): `docs/security/findings-log.md` lists R1–R11 and anything new with status, fix commit and retest result.

### Phase 6 — Notifications decision (Sprint 9) · #85 · Bryce

**Decided (D-NOTIF-1, approved at UAT 16 Oct):** basic in-app notifications stay on (`AppSettings.features.notifications = true`, built in #147). Rendering must stay escaped (5.2).  
**6.1 Only if the client approves by 16 Oct:** derived, read-only alerts (no new tables) for the signed-in user's visible test points: became Unprotected since last visit; no reading for N days (config, default 7); environmental change flag (provisional). Computed from summaries on page load; read state in `localStorage`; escaped rendering. No email/push.

### Phase 7 — Test data, environments and demo build (Sprint 9 → 16 Oct) · #138 Owen · #139 Alex

**7.1 Synthetic data generator** — `scripts/generate-synthetic-data.js`: creates N locations, a location with ≥100 test points (mix stationary/variable), relative X/Y layouts, and readings at configurable intervals over ≥90 days with realistic noise, some unprotected periods, gaps and environmental drift. Outputs (a) SQL/CSV for local seeding and (b) wide/long xlsx files for the import page. Deterministic with `--seed`.

**7.2 Staging environment** — **brought forward: Alex creates `cpm-staging` as soon as the #135 baseline exists (target 9 Oct), because #133 and the RLS tests are tested there.** Document in `docs/deployment.md` how to create a second Supabase project ("staging") from migrations, seed synthetic data, create the test accounts (admin, engineer, inactive engineer) and point a local/hosted copy at it via config. UAT and performance testing use staging, not the live project.

**7.3 Test scenarios** — `docs/testing/uat-scenarios.md` for the 19–23 Oct session: find a location needing attention; investigate a test point and its history; interpret environmental trends; use GPS map and schematic to locate closely spaced points; enter a reading with current/voltage; (admin) import a file and read the reject report. For each: goal, steps, success criteria, fields to record (completion, errors, assistance, time, comments).

**7.4 Demo build checklist** · #139 — by 16 Oct: Phases 0–5 merged; migrations applied to staging; synthetic + approved client sample loaded; smoke test script (`docs/testing/smoke-test.md`) passes; tag `v2.0.0-demo`.

### Phase 8 — Validation support (Sprint 10–11, 19 Oct – 6 Nov) — Deliverables D4, D5

**8.1 Security test evidence** · #91–#93 · Owen — run `tests/db/*` against staging copy; record results in `docs/testing/security-test-report.md` (auth, sessions, RLS matrix, unauthorised access by direct API calls with the publishable key, import validation, error handling). Selected OWASP WSTG cases: ATHN-03/04/09, SESS-02/03/06/07, ATHZ-02/03, INPV-01/02 (reflected/stored XSS), CONF-07 (HSTS), CLNT-09 (clickjacking).

**8.2 Performance harness** · #94 · Owen — `scripts/perf/run-perf.js` (supabase-js with a test account on staging) and `scripts/perf/page-timings.js` (Playwright) measuring: dashboard load, weekly summary for the 100-test-point location, history 7/30/90 days, test point detail with 90 days, asset map, schematic, import of 45k rows. Repeat 5×, report median/p95 to `docs/testing/performance-report.md` with dataset sizes and environment. Targets (proposed): pages interactive < 3 s, queries < 1.5 s at median on staging.

**8.3 Optimisation** · #107 · Gabriel — based on 8.2: drop redundant indexes (`idx_reading_batches_location_reading_ts` duplicates `idx_reading_batches_location_ts`; `idx_reading_batches_reading_ts` duplicates `idx_reading_batches_ts`); serve history ranges > 7 days from `daily_summaries` (aggregated) and raw rows only for short ranges with server-side pagination (`range()`); add any missing composite indexes found with `explain analyze`; cap chart points (downsample to ≤ 2,000 per series client-side).

**8.4 Feedback fixes** · #105, #106, #108 · Bryce/Gabriel — triage UAT findings into GitHub issues labelled `uat` with priority; fix approved ones; add regression tests where logic is involved.

### Phase 9 — Documentation, release and handover (Sprint 12–14, 2–20 Nov) — Deliverable D5

Claude Code drafts; owners review. All under `docs/` unless noted.
- `architecture.md` (#96) — components diagram (Mermaid), request/auth flow (Supabase + PHP session), data flow for entry/import/summaries/cron.
- `database.md` (#96) — ERD (Mermaid) and table/column reference generated from the baseline + later migrations; RLS summary; functions and their privileges.
- `api.md` (#96) — every RPC and the Edge Function: parameters, permissions, errors.
- `deployment.md` (#97) — hosting requirements (Apache/PHP 8.x or equivalent), config/env, Supabase setup from migrations, auth settings, cron, Google Maps key restrictions, applying migrations, backups (Supabase daily backups + `pg_dump` procedure), restore drill, rollback (code tag + down-migration notes), release checklist.
- `guides/user-manual.md` (#98) — engineer and admin tasks with screenshots.
- `guides/import-guide.md` (#83, Phase 3).
- `testing/test-report.md` (#99) — summary of unit, security, performance and UAT results, defects and known limitations.
- `release-notes.md`, `known-limitations.md`, `handover-checklist.md` (#100).
- Update `README.md` to describe the actual system (remove inspection/image modules that were never built).
- Release (#113, #110): `v2.0.0-rc1` when development stops (6 Nov) and is demonstrated on 13 Nov; `v2.0.0` after Sprint 14 verification.

---

## 6. Schedule summary

| Sprint | Dates | Code focus | Tasks |
|---|---|---|---|
**Revised 28 Oct 2026.** The first UAT session with the client and engineers took place on **16 Oct**. Sprint 9 now runs until **development stops on 6 Nov** and absorbs the Sprint 10 and 11 work; the next client meeting is **13 Nov**. Details: `docs/sprints/SPRINT_09.md`.

| Sprint | Dates | Code focus | Tasks |
|---|---|---|---|
| 8 | 21 Sep – 13 Oct (done, merged via #146) | Baseline, security foundations, I/V schema | 0.1–0.6, 1.1–1.4, 2.1 (baseline commit carried into Sprint 9) |
| — | 16 Oct | First UAT session with client and engineers | Feedback recorded in Sprint 9 (#89) |
| 9 | 13 Oct – **6 Nov (development stops)** | Merge open work, baseline + staging, client import, schematic, Super Admin, UAT fixes, XSS, test data and evidence | 1.5, 2.2–2.3, Phase 3, Phase 4, Phase 5, 6, 7, Phase 8 |
| 12 | 7 – 12 Nov | Documentation, test report, release candidate, rehearsal (no new features) | Phase 9, `v2.0.0-rc1` |
| — | **13 Nov** | Client meeting: demo, acceptance, remaining decisions | #101 |
| 14 | 16 – 20 Nov | Final release + docs | `v2.0.0`, handover |

If Sprint 9 runs short, cut in this order (lowest value first): Super Admin transfer screen (keep the database rules) → import reconciliation extras (keep counts and the rejected-row report) → schematic extras (zoom/pan, clustering) → browser page timings (keep query timings) → CSP enforcement (keep Report-Only). Never cut the baseline (0.2), 1.1, 1.4, 3.1–3.3, the one-Super-Admin rule or 5.2.

---

## 7. Acceptance traceability

| Evidence | Produced by |
|---|---|
| B1 recovery / password change / Remember Me | 1.2, 1.3 + `docs/testing/security-test-report.md` |
| B2 sessions, expiry, deactivated accounts | 1.4, 1.5 |
| B3 access matrix + allowed/denied tests | 1.5 `access-matrix.md`, `rls-matrix-results.md` |
| B4 security findings and fixes | `docs/security/findings-log.md` (Phase 5) |
| B5 current/voltage end-to-end | 2.1–2.2 |
| B6 import counts and rejected-row reasons | 3.2–3.3 |
| B7 reconciliation, template, instructions | 3.4–3.5 |
| B8 relative positions | Phase 4 |
| B9 map → detail navigation | Phase 4 + UAT |
| B10 usability and acceptance | 7.3, 8.4 |
| B11 performance (≥100 test points) | 7.1, 8.2 |
| B12 release, update, recovery, handover | Phase 9 |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Client decisions arrive late | Provisional defaults in config (§3); changes become config edits |
| Live database changed by mistake | Migrations only; Alex applies; staging for tests; Supabase backups before each apply |
| Import of large files is slow or partial | Chunked transactional RPC, idempotent re-run, rollback by run, finalize step |
| Auth emails rate-limited on built-in SMTP | Configure custom SMTP for the demo; test early |
| Session changes lock users out | Feature-test on staging; keep timeouts in config; clear error messages |
| Scope creep before freeze | Out-of-scope list (§1.7); new requests logged in `docs/decisions.md` |

---

## Appendix A — File map for common changes

| Area | Files |
|---|---|
| Login / session | `www/index.php`, `www/js/login.js`, `www/js/supabaseClient.js`, `www/php/session-guard.php`, `set-session.php`, `clear-session.php`, `www/js/common.js` (`autoGuard`, logout) |
| Settings / password | `www/settings.php`, `www/js/settings.js` |
| Users | `www/admin.php`, `www/js/admin.js`, `supabase/functions/manage-users/index.ts` |
| Manual entry | `www/testpoint-update.php`, `www/js/testpoint-update.js`, RPCs `create_manual_reading`, `update_manual_reading` |
| Test point detail + per-point import | `www/testpoint-view.php`, `www/js/testpoint-view.js` (`importDetailReadingsFromExcel`, `buildDetailImportTemplateRows`) |
| Test point list / xlsx | `www/testpoints.php`, `www/js/testpoints.js` (`importTestPointsFromExcel`, export) |
| History / CSV | `www/history.php`, `www/js/history.js` |
| Weekly summary | `www/weekly.php`, `www/js/weekly.js`, `weekly-location-aggregator.js`, `test-point-weekly-view.js` |
| Dashboard | `www/dashboard.php`, `www/js/dashboard*.js` |
| Asset map / positions | `www/asset-map.php`, `www/js/asset-map.js`, `asset-map-repository.js`, `test-point-position-*.js`, `www/php/test-point-position-modal.php` |
| Data access | `www/js/repositories/supabase-repositories.js` |
| Status rules | `www/js/services/status.js`, `chart-protection-presentation.js` |

## Appendix B — Current database functions

| Function | Security | Called by |
|---|---|---|
| create_manual_reading, update_manual_reading | definer | manual entry |
| get_asset_map_points, get_test_point_position_history, set_test_point_position | invoker / definer / definer | asset map, positions |
| get_test_point_daily_summaries, get_test_point_weekly_summaries (2 overloads each), compare_weekly_summaries, get_weekly_summary_available_weeks, check_recent_reading_exists | invoker | weekly/dashboard |
| is_admin, summary_is_engineer_or_admin | definer | RLS helpers |
| current_user_is_admin, current_user_is_active, summary_week_start | invoker | RLS helpers |
| process_summary_refresh_queue, refresh_daily_summary, refresh_weekly_summary, queue_summary_refresh, backfill_daily_and_weekly_summaries | definer | pg_cron / triggers / admin maintenance only |
| queue_summary_refresh_for_reading_change, queue_summary_refresh_for_batch_timestamp_change, set_test_point_positions_updated_at | definer / invoker | triggers |
| rls_auto_enable | definer | event trigger |
