# Live release runbook: branch `sprint-9-owen-api-security-ci-testing`

For the person with live access (Alex, or whoever Alex delegates to). Prepared 4 Nov 2026 by Owen with Claude Code. Alex has approved the deployment.

CLAUDE.md still applies: only Alex (or his delegate) touches the live project `pscwapylbjvulvsszdur`. Values in `<angle brackets>` are deployment-specific. They are not recorded in the repo and must come from whoever runs the server; do not guess them.

## 1. What this release contains

The branch is **90 commits ahead of `main`** and contains everything on `main` and `development`. Deploying it is a **full Sprint 8–9 release**, not only the Readings GET API. It needs database, Edge Function, web and Apache steps, **in this order**.

| Part | What changes on live | Source |
| --- | --- | --- |
| Database | Up to 7 migrations after the baseline (see §3) | `supabase/migrations/2026100811…` → `20261103090000` |
| Edge Function | `manage-users` (Super Admin rules, R12 closed) | `supabase/functions/manage-users/` |
| Web app (`www/`) | Super Admin admin page, password reset flow, session hardening and security headers, µS/cm units, current/voltage, schematic view, toast XSS fix, Readings API POST + **GET** + `/api/readings` alias | `www/` |
| Apache | Rewrite rule for the alias (in `www/.htaccess`), API environment variables | §6 |

**Order matters:** the frontend reads `is_super_admin`, so the migrations must be applied **before** `www/` is deployed. The Readings API needs `ingest_reading_v1` (POST) and the `current_a` / `voltage_v` columns (GET `field=voltage|current`).

## 2. Pre-flight (read-only)

On a trusted machine with a repo checkout:

```bash
git fetch origin
git checkout sprint-9-owen-api-security-ci-testing && git pull --ff-only
git log -1 --oneline                       # record: this commit is the release
npm ci || npm install
npm test                                   # expect 0 failed (staging suites skip)
npm run demo:api                           # expect 29/29
```

Check what live has **without changing it** (`LIVE_DB_URL` from Alex's untracked `.env`):

```bash
npx supabase migration list --db-url "$LIVE_DB_URL"
```

- **STOP** if live shows a version that is not in `supabase/migrations/` (history mismatch). Do not run `migration repair` without Alex.
- **STOP** if the baseline `20261007065859` is not listed as applied on live. It was pulled from live (#135), so it should be. Alex decides how to mark it; `db push` must never try to re-create the existing schema.
- Note which of these are still pending on live: `20261008100000`, `20261008110000`, `20261008120000`, `20261024090000`, `20261028100000`, `20261029090000`, `20261103090000`.

**Staging evidence gate.** Staging already has all 8 migrations and `manage-users` (test matrix G08, 3 Nov). Before live, run the read-only staging suites, including the new GET suite:

```bash
RUN_DB_TESTS=1 npm run test:db             # PowerShell: $env:RUN_DB_TESTS=1; npm run test:db
```

Expect 0 failed. The suite "Readings GET API returns real staging readings (read-only)" runs the real GET endpoint against the staging database. Record the counts in `docs/week9/test-matrix.md` row D05. **Do not go live if it fails.**

## 3. Backups (before any change)

- **Database:** confirm a recent Supabase backup or point-in-time restore exists for `pscwapylbjvulvsszdur` (Dashboard → Database → Backups). Take a manual one if the plan allows it.
- **Web root:** `cp -a <docroot> <docroot>.bak-$(date +%Y%m%d%H%M)`. Also note the Apache vhost / `SetEnv` lines as they are now.
- **Edge Function:** note the currently deployed `manage-users` version (Dashboard → Edge Functions), so it can be redeployed if needed.

## 4. Database (live; Alex)

Apply the pending migrations **in filename order**, then run the read-only checks:

```bash
npx supabase db push --db-url "$LIVE_DB_URL"     # applies pending files in order; review the list it prints before confirming
```

In the live SQL editor, run **section 1 only** (read-only) of:
- `supabase/queries/super_admin_staging_checks.sql` → every row `ok = true`
- `supabase/queries/ingest_api_staging_checks.sql` → every row `ok = true`

Do not run section 2 of the Super Admin file on live: those blocks are simulations for staging.

**Assign the live Super Admin** (handoff Phase 7 step 1: client question §9.1; until it is answered, use Alex's admin account):

```sql
update public.users set is_super_admin = true
where email = '<live super admin email>' and role = 'admin' and is_active
returning id, email, is_super_admin;
```

## 5. Edge Function (live)

```bash
npx supabase functions deploy manage-users --project-ref pscwapylbjvulvsszdur
```

## 6. Web app and Apache (live)

1. **Deploy `www/`** from the release commit (§2) to `<docroot>`, using the server's normal method. Only `www/` goes there. Never `tests/`, `scripts/`, `supabase/`, `docs/`, `.env` or `data/`. Make sure `www/.htaccess` and `www/api/readings.php` arrive (dotfiles are easy to miss when copying).
2. **Rewrites:** the vhost needs `AllowOverride All` for `<docroot>` and `mod_rewrite` loaded. Check with `apachectl -M | grep rewrite` (or `httpd -M | findstr rewrite` on Windows).
3. **Environment** (vhost or server config, never committed):
   ```apache
   SetEnv SUPABASE_URL "https://pscwapylbjvulvsszdur.supabase.co"
   SetEnv SUPABASE_PUBLISHABLE_KEY "<live publishable key>"
   SetEnv CPM_READINGS_READ_ENABLED "1"            # GET retrieval
   # POST ingestion stays OFF until its own go-live (docs/week9/readings-api.md runbook step 5):
   # SetEnv CPM_INGESTION_SCOPES "{\"<account-uuid>\":[\"<point-uuid>\"]}"
   # SetEnv CPM_INGESTION_ENABLED "1"
   # CGIPassAuth On                                # only for PHP-FPM/CGI
   ```
   Keep `CPM_HSTS_ENABLED` and `CPM_TRUST_TLS_PROXY` unset unless the owner has verified HTTPS for the whole site or a trusted TLS proxy. PHP must run with `display_errors=Off`, `display_startup_errors=Off`, `log_errors=On`.
4. **Supabase Auth:** set the Site URL / redirect URLs to the live app URL (`docs/security/auth-configuration.md`), so password reset emails link to `https://<live-host>/reset-password.php`.
5. **Reload:** `apachectl configtest && apachectl graceful` (or `systemctl reload apache2` / `httpd -k restart`).

## 7. Smoke tests (live)

**API (read-only script):**

```bash
CPM_API_BASE=https://<live-host> \
SUPABASE_URL=https://pscwapylbjvulvsszdur.supabase.co \
SUPABASE_PUBLISHABLE_KEY=<live publishable key> \
CPM_SMOKE_EMAIL=<active engineer or admin> CPM_SMOKE_PASSWORD=<…> \
npm run smoke:readings
```

PowerShell: set each variable with `$env:NAME='…'` first, then run `npm run smoke:readings`.

Expect `11/11 passed`. The script never writes. It covers:
- GET v1, `/api/readings` and `/api/readings/`: same array, no redirect;
- paging;
- missing `field` / `timestamp` → 400 (exact client body);
- no token or a bad token → 401;
- alias POST → 405 `Allow: GET`;
- v1 PUT → 405 `Allow: GET, POST`;
- POST v1 still answers `ingestion_disabled` while ingestion is off.

Keep the printed request ids; it prints no tokens.

**App (browser):**
- [ ] Sign in as the Super Admin, a plain Admin and an Engineer. Each lands on the dashboard; the session survives a page change.
- [ ] Admin page: the Super Admin sees "Super Admin" on its row and can manage Admins; a plain Admin can manage Engineers only; nobody can deactivate their own row.
- [ ] Forgot-password email arrives and its link opens `reset-password.php` on the live host.
- [ ] Dashboard, weekly view, history, a test point page and the asset map / schematic load without console errors. Conductivity shows µS/cm.
- [ ] `curl -I https://<live-host>/` shows `X-Content-Type-Options`, `Content-Security-Policy` (`frame-ancestors 'none'`) and `Referrer-Policy`. `https://<live-host>/.htaccess` and `/scripts/` give 403.

## 8. Rollback (reverse order)

1. **API only:** remove `CPM_READINGS_READ_ENABLED` and reload → GET returns 503; nothing else changes.
2. **Web:** restore `<docroot>.bak-…` and the previous `SetEnv` lines; reload Apache.
3. **Edge Function:** redeploy the previous `manage-users`.
4. **Database (Alex only, only if needed):** the rollbacks in `supabase/rollbacks/`, newest first. For example, `20261103090000_…_rollback.sql`, then `20261029090000_…`, `20261028100000_super_admin_rollback.sql` (restores the baseline policy and R12), `20261024090000_…`. Readings already stored are kept. Roll back the web app (step 2) **before** the Super Admin migration, because the frontend reads `is_super_admin`.

## 9. After release

- Record in `docs/week9/test-matrix.md`: the release commit, the date, the migration list before and after, the check-script results, smoke `11/11` with request ids, and the browser checklist. Never record tokens or passwords.
- Give the client the base URL and the "GET retrieval" contract section of `docs/week9/readings-api.md`.
- Still open with the client: the measurement interpretation of `field` (potential in mV, voltage = rectifier output in V); who holds the Super Admin at handover (§9.1).
- Bring `main` in line with what is live. Alex merges this branch (or `sprint-9` once it has the same content) into `development` and `main`, so the repo's `main` matches production.
