# Run me: Super Admin + Readings API (connected to Supabase), staging to live

For **Alex's Claude Code**. Alex: open Claude Code in your clone of `ICT2114_ITP_SE_Team_24` and say:

> Follow `Alex_Handoff_Super_Admin.md` (or the copy in `docs/handoff/`) step by step.

---

## Instructions for Claude

You are finishing work Owen prepared on branch `sprint-9-owen-api-security-ci-testing`: the confirmed Super Admin (D-ROLE-1, #49, closes R12), and connecting the Readings API to Supabase so external systems can send readings instead of uploading Excel. Everything is built and unit-tested; **nothing is applied to staging or live yet, and the API is not connected to any Supabase project.**

### Rules for this whole run

- Follow `CLAUDE.md`. Work on **staging only** until Phase 7.
- **Never** target the live project `pscwapylbjvulvsszdur` before Phase 7, and in Phase 7 only after Alex types an explicit "go" for each step.
- Target staging with `--db-url "$STAGING_DB_URL"` or `--project-ref <staging-ref>`. **Never `supabase link`.**
- At every **STOP**, report what you saw and wait for Alex.
- If any check doesn't match the expected result, stop and report it. Don't "fix" it by loosening tests or rules.
- Never print or commit secrets, tokens, `.env` contents or client data.
- Record results as you go in `docs/week9/test-matrix.md` rows **G08** and **G09**.

### Phase 0: get the code

1. `git fetch origin`, then `git switch sprint-9-owen-api-security-ci-testing` (or check out `origin/sprint-9-owen-api-security-ci-testing`). If the branch doesn't exist on origin, **STOP**: Owen hasn't pushed yet.
2. Read `CLAUDE.md` and `docs/handoff/super-admin-and-readings-api.md`. That handoff is the detailed version of this file; follow it where it gives more detail.
3. Merge order into `sprint-9`: `sprint-9-135-alex-db-baseline`, then `sprint-9-074-alex-replan-and-roles`, then this branch. To test before merging, create a throwaway local branch from `origin/sprint-9-135-alex-db-baseline` and merge the other two into it (Owen's trial merge had no conflicts).
4. `npm ci` then `npm test` → expect **95 pass, 0 fail, 2 skipped**. PHP is required (`PHP_BINARY` or XAMPP).
5. Check that the root `.env` has every `STAGING_*` key from `.env.example`: `STAGING_DB_URL`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPER_ADMIN_EMAIL/PASSWORD`, `STAGING_ADMIN_EMAIL/PASSWORD`, and optionally `STAGING_STATIONARY_TEST_POINT_ID`. The two admin accounts must already exist on staging, both active admins, and different. If any key is missing, **STOP** and ask Alex for it. Never invent values.

**STOP**: report test results and anything missing.

**Before the migration is applied,** the new code still runs: sign-in and engineer management work, because the app reads `is_super_admin` only if it exists. But no account is Super Admin yet, so **nobody can create, edit or deactivate Admin accounts from the admin page** until Phase 1 (migration + assignment) is done on that database. Apply the migration and assign the Super Admin soon after merging.

### Phase 1: staging database

1. `npx supabase migration list --db-url "$STAGING_DB_URL"`. If remote has versions that local doesn't, **STOP**; don't run `migration repair`.
2. Show Alex the pending list. Expected, in order: `20261008110000` (#133), `20261008120000` (#134), `20261024090000`, `20261028100000` (Super Admin), `20261029090000` (API), plus any others not yet applied. **STOP** for a "go".
3. `npx supabase db push --db-url "$STAGING_DB_URL"`
4. Assign the staging Super Admin. Run as SQL against `$STAGING_DB_URL`, or ask Alex to run it in the staging SQL editor:
   ```sql
   update public.users set is_super_admin = true
   where email = '<STAGING_SUPER_ADMIN_EMAIL>' and role = 'admin' and is_active
   returning id, email, is_super_admin;
   ```
   It must return exactly one row.
5. Run section 1 of `supabase/queries/super_admin_staging_checks.sql` and of `supabase/queries/ingest_api_staging_checks.sql`. Every row must be `ok = true`.

### Phase 2: Edge Function on staging

```bash
npx supabase functions deploy manage-users --project-ref <staging-ref>
```

If not logged in, ask Alex to run `npx supabase login`.

### Phase 3: automated staging tests

```bash
RUN_DB_TESTS=1 npm run test:db
# PowerShell: $env:RUN_DB_TESTS=1; npm run test:db
```

All subtests must pass. The suite refuses the live project, creates two `cpm-dbtest-*@example.com` accounts and deletes them at the end. On failure: **STOP** and report the subtest name and the error.

### Phase 4: browser checks on staging (with Alex)

1. Temporarily point the app at staging. Edit `url` and `publishableKey` in `www/js/config/supabase-config.js` and the matching fallbacks in `www/php/config.php`. **These edits must never be committed.**
2. `npm run serve`, then ask Alex to check at `http://localhost:5500` and send screenshots:
   - **Super Admin:**
     - the top bar says "Super Admin";
     - Add User offers Admin;
     - Delete appears on other rows;
   - **Plain Admin:**
     - Add User offers engineers only;
     - engineer rows have Edit, Deactivate and Delete;
     - Admin and Super Admin rows are locked, with a tooltip.
   - **Engineer:** no Admin menu, and `admin.php` redirects to the dashboard.
3. Revert the config edits (`git diff` on those two files must be empty).

### Phase 5: connect the Readings API to Supabase (staging)

The API is currently **not connected to any Supabase project**: its database function isn't applied, its server settings aren't set, and it answers `503 ingestion_disabled` everywhere. This phase connects it to **staging** and proves a real reading arrives. Details: `docs/week9/readings-api.md` ("Go-live runbook").

**5.1 Database side (done in Phase 1, check it)**
- Phase 1 applied `20261008120000` (#134), `20261024090000` and `20261029090000`.
- Section 1 of `supabase/queries/ingest_api_staging_checks.sql` must be all `ok = true`, including "ingest_reading_v1 is the 29 Oct version". If not, **STOP**.

**5.2 Ingestion account and test points (staging)**
1. On the staging admin page, an Admin creates a dedicated account: role **Corrosion Engineer**, e.g. `ingestion-staging@<domain>`, with a strong password. Ask Alex for the email and password; never invent them.
2. Pick four staging test points and note their ids:
   - **P_VAR:** active, type `variable`, **assigned** to the ingestion account;
   - **P_STAT:** active, type `stationary`, **assigned** to the ingestion account;
   - **P_UNASSIGNED:** active, **not** assigned to it;
   - **P_OUT:** any other active point (it stays out of the scope list).
   
   Assign through the Test Points page, or with SQL on staging:
   ```sql
   select id from public.users where email = '<ingestion email>';
   update public.test_points set assigned_engineer_id = '<ingestion-account-uuid>'
   where id in ('<P_VAR>', '<P_STAT>');
   select id, label, type, is_active, assigned_engineer_id from public.test_points
   where id in ('<P_VAR>', '<P_STAT>', '<P_UNASSIGNED>', '<P_OUT>');
   ```
3. Add to the root `.env` (untracked) for the reference client:
   ```
   SUPABASE_URL=<STAGING_SUPABASE_URL>
   SUPABASE_PUBLISHABLE_KEY=<STAGING_SUPABASE_PUBLISHABLE_KEY>
   CPM_API_URL=http://127.0.0.1:5501/api/v1/readings/
   CPM_API_EMAIL=<ingestion email>
   CPM_API_PASSWORD=<ingestion password>
   ```
   `SUPABASE_URL` here **must be the staging URL**. **STOP** if it contains `pscwapylbjvulvsszdur`.

**5.3 Run the API locally, pointed at staging**

⚠ `www/php/config.php` falls back to the **live** project when `SUPABASE_URL` isn't set. Always set it to staging before starting PHP, and check it.

The test router (`tests/php/api-router.php`) stands in for the HTTPS server locally. It's for testing only and is never deployed.

PowerShell:
```powershell
$env:SUPABASE_URL = "<STAGING_SUPABASE_URL>"
$env:SUPABASE_PUBLISHABLE_KEY = "<STAGING_SUPABASE_PUBLISHABLE_KEY>"
$env:CPM_INGESTION_SCOPES = '{"<ingestion-account-uuid>":["<P_VAR>","<P_STAT>","<P_UNASSIGNED>"]}'
$env:CPM_INGESTION_ENABLED = "1"
& 'C:\xampp\php\php.exe' -d display_errors=0 -S 127.0.0.1:5501 tests/php/api-router.php
```
bash:
```bash
SUPABASE_URL=<staging url> SUPABASE_PUBLISHABLE_KEY=<staging key> CPM_INGESTION_ENABLED=1 \
CPM_INGESTION_SCOPES='{"<ingestion-account-uuid>":["<P_VAR>","<P_STAT>","<P_UNASSIGNED>"]}' \
php -d display_errors=0 -S 127.0.0.1:5501 tests/php/api-router.php
```

**5.4 Send real readings** (second terminal; timestamps must be in the past (and not before 2000): use today's date at earlier hours, e.g. `<today>T09:00:00+08:00`)

| # | Command (`node scripts/api/send-reading.js '<json>'`) | Expected |
|---|---|---|
| 1 | `{"test_point_id":"<P_VAR>","reading_ts":"<T1>","value_mv":-850}` | 201 + `reading_id` |
| 2 | the same command again | 409 `duplicate_reading` |
| 3 | `{"test_point_id":"<P_VAR>","reading_ts":"<T2>","value_mv":-900,"current_a":10,"voltage_v":24}` | 201 |
| 4 | `{"test_point_id":"<P_STAT>","reading_ts":"<T3>","value_mv":-900,"current_a":10,"voltage_v":24}` | 422 `invalid_reading` |
| 5 | `{"test_point_id":"<P_UNASSIGNED>","reading_ts":"<T4>","value_mv":-850}` | 403 `write_denied` (database check) |
| 6 | `{"test_point_id":"<P_OUT>","reading_ts":"<T5>","value_mv":-850}` | 403 `scope_denied` (server check) |
| 7 | `{"test_point_id":"<P_VAR>","reading_ts":"<T6>","value_mv":9000}` | 422 |
| 8 | `{"test_point_id":"<P_VAR>","reading_ts":"2099-01-01T00:00:00Z","value_mv":-850}` | 422 future |

Also, with no token: `curl.exe -X POST http://127.0.0.1:5501/api/v1/readings/ -H "Content-Type: application/json" -d "{}"` → 401 `invalid_token` (use `curl.exe` in PowerShell; plain `curl` there is a different command).

Use a different timestamp at least 2 minutes apart for each of T1–T6.

**5.5 Check it arrived like a manual reading**
- Section 4 of `ingest_api_staging_checks.sql` with the reading ids from tests 1 and 3. Test 3 must show `current_a = 10`, `voltage_v = 24`, **`power_watts = 240`**; `is_protected` true for −850 and −900.
- With the app pointed at staging (as in Phase 4), the readings appear on the Test Point page, history, dashboard and weekly summary, the same as a manual reading.
- Note the reading ids and request IDs (`HTTP … request …` line) in G08. **STOP** and report.

**5.6 Clean up**

Stop the PHP server and close that terminal (the `CPM_*` settings disappear with it). Leave the test readings on staging unless Alex wants them removed.

### Phase 6: evidence and PR

1. Fill G08/G09 in `docs/week9/test-matrix.md` with dates, results and request IDs.
2. On the 074 branch's `docs/security/findings-log.md`, mark **R12 fixed**, with the Phase 3 R12 subtest as the retest.
3. Commit, push, and open a PR into `sprint-9` with `Closes #49`. The description should list:
   - both migrations;
   - the Edge Function deploy;
   - the Super Admin assignment SQL;
   - Phase 3 and 5 results;
   - the screenshots.

**STOP**: Alex reviews and merges.

### Phase 7: live (only with Alex's explicit "go" for each step)

1. Ask Alex who holds the Super Admin on live (client question, access matrix §9.1). If it's not decided yet, use Alex's own admin account and hand it over later with the SQL in the migration header.
2. Apply the same pending migrations to live, in the same order. Run both check scripts.
3. Deploy `manage-users` to live, **then** the frontend. The frontend reads `is_super_admin`, so it must come after the migration.
4. Assign the live Super Admin (Phase 1 step 4 SQL with the agreed email). Quick re-check from Phase 4.
5. **Connect the Readings API to live** (each step needs Alex's "go"):
   1. The two API migrations were applied in step 2. Section 1 of `ingest_api_staging_checks.sql` on live must be all `ok = true`.
   2. A live Admin creates the live ingestion account (Corrosion Engineer) and assigns it the test points the client's system will report for. Its password is stored only in the sending system's secret store.
   3. On the live web server (Apache vhost or server config, **never committed**):
      ```apache
      SetEnv SUPABASE_URL "https://pscwapylbjvulvsszdur.supabase.co"
      SetEnv SUPABASE_PUBLISHABLE_KEY "<live publishable key>"
      SetEnv CPM_INGESTION_SCOPES "{\"<live-account-uuid>\":[\"<point-uuid-1>\",\"<point-uuid-2>\"]}"
      CGIPassAuth On   # only for PHP-FPM/CGI: passes the Authorization header to PHP
      ```
      HTTPS must terminate at Apache or a trusted proxy that sets `HTTPS=on`. `php.ini`: `display_errors=Off`, `log_errors=On`. Reload Apache. The API still answers 503 `ingestion_disabled`; that's expected.
   4. Turn it on: add `SetEnv CPM_INGESTION_ENABLED "1"` and reload Apache.
   5. Smoke test from a trusted machine with the live account (`CPM_API_URL=https://<live domain>/api/v1/readings/`): one reading → 201, and it's visible in the app. **STOP** and report.
   6. **Turn it off at any time:** remove `CPM_INGESTION_ENABLED` and reload → 503 immediately. To block the account entirely, deactivate it on the admin page.

### Handing over the Super Admin later (database owner only)

The Super Admin is assigned only by the database owner. To give it to another active Admin, run this in the SQL editor of the project. It's one transaction, so there's never zero or two Super Admins:

```sql
begin;
update public.users set is_super_admin = false where is_super_admin;
update public.users set is_super_admin = true
where email = '<new holder email>' and role = 'admin' and is_active;
commit;
```

The second update must report `UPDATE 1`. If it reports `UPDATE 0`, run `rollback;` instead of `commit;` and check the email. The change is logged in `user_account_changes`, with `changed_by` empty.

### Decisions Alex should confirm (raise them at the first STOP)

- **Admins can delete engineer accounts.** Keep, or make it Super Admin only? The rule is `canDeleteUser`, in both `www/js/user-permissions.js` and `supabase/functions/manage-users/permissions.mts`.
- **Readings API plausibility limits** are provisional until the client confirms instrument ranges.

### Rollback

- **Super Admin:** redeploy the previous `manage-users` and frontend, then `supabase/rollbacks/20261028100000_super_admin_rollback.sql`.
- **Readings API:** unset `CPM_INGESTION_ENABLED`. For the database, `supabase/rollbacks/20261029090000_*_rollback.sql`, then `20261024090000_ingest_reading_v1_rollback.sql`.
