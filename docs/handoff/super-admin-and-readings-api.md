# Handoff: Super Admin (D-ROLE-1, #49, R12) and Readings API go-live

Prepared 29 Oct 2026 by Owen (with Claude Code) for Alex. Branch: `sprint-9-owen-api-security-ci-testing`. Everything below is built and unit-tested; **nothing has been applied to staging or live**. This file is written so Alex's Claude Code can run it step by step.

## Paste this into Claude Code

> Read `CLAUDE.md`, then `docs/handoff/super-admin-and-readings-api.md`, and work through it phase by phase on the **staging** project only. Stop and ask me at every **STOP** marker, before any step that touches the live project, and whenever a check does not give the expected result. Record results in `docs/week9/test-matrix.md` (rows G08, G09) as you go.

## What is on the branch

| Area | Files | State |
|---|---|---|
| Super Admin, as confirmed on 28 Oct (`sprint-9-074-alex-replan-and-roles`): Admin permissions + managing Admins; Admins manage engineers only; exactly one Super Admin, assigned and handed over only by the database owner; every account change logged. **Closes R12**: no browser writes to `users` | `supabase/migrations/20261028100000_super_admin.sql` (+ rollback), `supabase/functions/manage-users/{index.ts,permissions.mts}`, `www/js/user-permissions.js`, `www/js/admin.js`, `www/admin.php`, `www/js/common.js`, `www/js/settings.js`, repository profile mapping | Built, unit-tested |
| Readings API go-live: current/voltage on variable points, plausibility limits, request IDs, scope fixes | `supabase/migrations/20261029090000_ingest_reading_v1_electrical_and_limits.sql` (+ rollback), `www/api/v1/readings/index.php`, `www/php/{reading-validation,app-settings}.php`, `scripts/api/send-reading.js`, `docs/week9/readings-api.md` | Built, unit-tested |
| Readings API GET retrieval (client request, 4 Nov): `GET /api/v1/readings/?timestamp=…` plus GET-only alias `/api/readings` (`.htaccess` rewrite), always a JSON array, `field` required, `limit`/`offset` paging, own flag `CPM_READINGS_READ_ENABLED`, no migration | `www/api/v1/readings/index.php`, `www/api/readings.php`, `www/.htaccess`, `www/php/{reading-validation,app-settings}.php`, `tests/readings-get-api.test.js`, `docs/week9/readings-api.md` ("GET retrieval") | Built, stub-tested; staging not run; client confirmed array, required field, exact match, paging and path (4 Nov); measurement interpretation still pending |
| Security / CI | `www/js/toast.js` (stored XSS fixed), CI push + Dependabot now target `development` | Done |
| Tests | `tests/user-permissions.test.js`, `tests/readings-api-limits.test.js`, `tests/db-staging.test.js` (staging, `RUN_DB_TESTS=1`) | Unit: pass. Staging: not yet run |
| Check queries | `supabase/queries/super_admin_staging_checks.sql`, `supabase/queries/ingest_api_staging_checks.sql` | Ready |

Design note: the Super Admin is an `admin` row with `users.is_super_admin = true`, exactly as recorded in the plan (D-ROLE-1), so every existing `role = 'admin'` check (RLS, `is_admin()`, `require_role('admin')`, `ingest_reading_v1`) still applies.

How the rules are enforced:

1. **Database.** The `"Admins manage all users"` policy is dropped, so the browser cannot write to `users` at all. A `SECURITY INVOKER` guard trigger refuses `authenticated`/`anon` writes, and stops the service role from creating, demoting, deactivating, deleting or flagging the Super Admin. A unique index allows at most one. Only the database owner (SQL editor) can set or move the flag. An audit trigger writes `user_account_changes`.
2. **`manage-users`** checks the level rules (`permissions.mts`) before every service-role write, rejects inactive admins, and sends `X-CPM-Actor-Id` so the audit log records who made each change.
3. **Admin page** hides what the caller can't do, using the same rules (`user-permissions.js`). A test keeps the two rule copies identical.

## Phase 0: merge order and local checks

1. Merge order into `sprint-9`: `sprint-9-135-alex-db-baseline` (baseline must come first), then `sprint-9-074-alex-replan-and-roles` (plan/CLAUDE.md/access matrix), then this branch. This branch leaves those docs untouched, so there should be no doc conflicts. If you test before merging, base a throwaway branch on the baseline branch and merge this one in.
2. `npm ci && npm test` → expect **95 pass, 2 skipped** (the skipped two are the staging tests). PHP is needed (XAMPP on Windows, or `PHP_BINARY`).
3. Root `.env` (untracked): fill the `STAGING_*` keys listed in `.env.example`.

**STOP** if tests fail.

## Phase 1: staging database

Target staging explicitly; never `supabase link` to staging; never use the live ref `pscwapylbjvulvsszdur` here.

1. `npx supabase migration list --db-url "$STAGING_DB_URL"`. **STOP** if remote has versions that local doesn't (history mismatch): don't run `migration repair` without Alex.
2. Pending migrations should be, in order: `20261008110000` (#133), `20261008120000` (#134), `20261024090000`, `20261028100000` (Super Admin), `20261029090000`, plus anything else not yet applied. Apply: `npx supabase db push --db-url "$STAGING_DB_URL"`.
3. Assign the staging Super Admin (SQL editor, staging):
   ```sql
   update public.users set is_super_admin = true
   where email = '<STAGING_SUPER_ADMIN_EMAIL>' and role = 'admin' and is_active
   returning id, email, is_super_admin;
   ```
   Make sure `STAGING_ADMIN_EMAIL` is a different, active, plain admin.
4. Run `supabase/queries/super_admin_staging_checks.sql` and `supabase/queries/ingest_api_staging_checks.sql` section 1 → **every row `ok = true`**. Try the section 2 blocks of the Super Admin file and confirm each gives the commented result.

## Phase 2: Edge Function on staging

```bash
npx supabase login
npx supabase functions deploy manage-users --project-ref <staging-ref>
```

`permissions.mts` is bundled with `index.ts`. The function uses the built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` secrets; nothing to set.

## Phase 3: automated staging tests

```bash
RUN_DB_TESTS=1 npm run test:db          # PowerShell: $env:RUN_DB_TESTS=1; npm run test:db
```

The tests refuse the live project. They sign in as the two staging admins and check:

- R12 (direct writes refused);
- engineer create, update and delete by an Admin;
- Admin management by the Super Admin only;
- the Super Admin can't be deactivated, demoted or deleted;
- the audit log records the right actor.

They also check that `ingest_reading_v1` rejects anon, future/old timestamps, implausible values, power and bad offsets. Set `STAGING_STATIONARY_TEST_POINT_ID` to also check current/voltage on a stationary point. They create two `cpm-dbtest-*@example.com` accounts and delete them at the end.

**STOP** on any failure: report the subtest name and error before changing code.

## Phase 4: browser UAT on staging

1. Locally (**do not commit**), point the app at staging: `www/js/config/supabase-config.js` (`url`, `publishableKey`) and the matching fallbacks in `www/php/config.php`, or set `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` for PHP. Then `npm run serve` and open `http://localhost:5500`.
2. Check, and take screenshots for the PR:
   - **Super Admin:** the top bar says "Super Admin". Add User can choose Admin. Delete appears on Admin and engineer rows but not on its own row. There is no "Make Super Admin" button.
   - **Plain Admin:** the top bar says "Admin". Add User offers Corrosion Engineer only. Engineer rows have Edit, Deactivate and Delete. Admin and Super Admin rows have Edit and Deactivate disabled, with a tooltip. The note "You manage engineer accounts…" is shown.
   - **Engineer:** no Admin page in the menu; opening `admin.php` directly redirects to the dashboard.
   - A deactivated user is signed out within 5 minutes; Settings shows the right role label.
3. Afterwards, revert the local config changes (`git status` must be clean apart from intended changes).

## Phase 5: Readings API on staging

Follow `docs/week9/readings-api.md` → "Go-live runbook", steps 2 and 4. For a local run without Apache/TLS, the test router fakes `HTTPS=on`:

```bash
SUPABASE_URL=<staging url> SUPABASE_PUBLISHABLE_KEY=<staging key> CPM_INGESTION_ENABLED=1 \
CPM_INGESTION_SCOPES='{"<ingestion-account-uuid>":["<point-uuid>"]}' \
php -d display_errors=0 -S 127.0.0.1:5501 tests/php/api-router.php
# second terminal, .env: CPM_API_URL=http://127.0.0.1:5501/api/v1/readings/ plus CPM_API_EMAIL/PASSWORD
node scripts/api/send-reading.js '{"test_point_id":"<point-uuid>","value_mv":-850}'
```

Expected:

- 201, and the reading shows on the Test Point page, history and dashboard.
- Sending the same reading again gives 409.
- On a variable point, `current_a: 10, voltage_v: 24` stores `power_watts = 240` (check query 4).
- The out-of-scope, unassigned, implausible, future and no-token cases give the codes in the runbook.

These are real synthetic readings on staging; note their ids for clean-up.

## Phase 6: evidence and PR

1. `docs/week9/test-matrix.md`: fill G08 (staging DB / Edge Function / UAT) and G09 (hosted CI, branch protection) with dates, results and request IDs. No tokens or client data.
2. `docs/security/findings-log.md` (on the 074 branch): mark **R12 fixed** with this PR and the Phase 3 R12 subtest as the retest.
3. Open the PR into `sprint-9` with `Closes #49`. List both migrations, the Edge Function deploy, the Super Admin assignment SQL, and the UAT screenshots.

## Phase 7: live (Alex only, after review)

**STOP**: every step here needs Alex's explicit go-ahead.

1. **Client question (access matrix §9.1):** who holds the Super Admin at handover? Without an answer, assign it temporarily to Alex's admin account and hand it over later with the SQL in the migration header.
2. Apply the pending migrations to live in the same order as Phase 1, then run both check scripts.
3. Deploy `manage-users` to live, then deploy the frontend. The frontend must come **after** the migration: it reads `is_super_admin`.
4. Assign the Super Admin (Phase 1 step 3 SQL), then repeat the Phase 4 checks briefly.
5. Readings API: runbook step 5 (live ingestion account, Apache `SetEnv`, flag on, one smoke reading).

## Decisions and notes for Alex

- **Assigning or handing over the Super Admin** is a database-owner step: SQL in the migration header, logged in `user_account_changes` with `changed_by = null`.
- **Admins can delete engineer accounts** (`manage-users` delete), consistent with "Admins manage engineers". The access matrix lists create/deactivate but not delete; change `canDeleteUser` in both rule files if deletes should be Super Admin only.
- **Audit log** (`user_account_changes`) is readable by all admins, and there's no screen for it yet. SQL-editor changes have `changed_by = null`.
- **Handover and emergency recovery** (access matrix §8.5): reassign in the SQL editor as postgres, or delete the account in the Supabase dashboard. Both are deliberately allowed only for the hosting owner.
- **Readings API limits are provisional** until the client confirms instrument ranges (`APP_SETTINGS['ingestion']`, mirrored in SQL; a test keeps them equal).

## Rollback

- **Super Admin:** redeploy the previous `manage-users` and frontend, then run `supabase/rollbacks/20261028100000_super_admin_rollback.sql`. It restores the baseline policy, and with it R12. The audit table is kept.
- **Readings API:** unset `CPM_INGESTION_ENABLED` (and `CPM_READINGS_READ_ENABLED` for GET). For the database, run `supabase/rollbacks/20261029090000_…_rollback.sql`, then `20261024090000_ingest_reading_v1_rollback.sql`.
