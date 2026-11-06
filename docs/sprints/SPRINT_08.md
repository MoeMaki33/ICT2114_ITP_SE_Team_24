# Sprint 8 — Security and Data Foundation

**Dates:** 21 Sep – 2 Oct 2026 (explicit carry-over until Tue 6 Oct, see §2)  
**Milestone:** Milestone 3: ITP2 Build, Validation & Freeze  
**Parent issue:** [#45 3.2 Sprint 8: Security and Data Foundation](https://github.com/heyalexahh/ICT2114_ITP_SE_Team_24/issues/45)  
**Sprint branch:** `Sprint-8` (created from `development`)  
**Work packages:** WP1 Security, Access Control and Maintainability · WP2.1 Measurements · WP4.1 Environment and migrations  
**Full detail:** `docs/IMPLEMENTATION_PLAN.md` (Phases 0, 1, 2.1) and `CLAUDE.md` (repo root). Alex commits both, plus this file, to `Sprint-8` on day 1 (see 3.1).

---

## 1. Sprint goal

> **Make the existing app safe and reproducible before we build anything new.**

**Planned output (Project Plan / Scope of Work, App. C):** secure authentication and session foundation, access matrix, current/voltage database schema.

What that means at the end of this sprint:

| Outcome | Target state at sprint end |
|---|---|
| Database functions no longer callable by anonymous users | **Merged and verified** |
| Database schema reproducible from the repo; `manage-users` function in git | **Merged and verified** |
| No secret-bearing script or client data path under `www/`; `Sprint-8` contains the ITP 1 `sprint-5` fixes; CI runs tests | **Merged and verified** |
| Engineer/Admin access matrix | **Draft submitted for client confirmation** (approval is a Sprint 9 dependency) |
| Password recovery, verified password change, Remember Me, PHP session hardening | Merged and verified if possible; otherwise **explicitly carried over** with owner and next step |
| Current/voltage schema | Migration **prepared and reviewed**; applied once the client confirms where the values belong (see #134) |

### Why this sprint matters

Sprint 9 builds the client import, current/voltage screens and the relative map for the **19–23 Oct client meeting**. All of that depends on this sprint's foundation: clean migrations, locked-down functions and stable sessions.

---

## 2. Status and priorities (1 Oct)

- Sprint 7 is closed (#39–#43 done; Project Plan submitted 20 Sep).
- `Sprint-8` was created from `development` on 1 Oct and has the same content as `main`. **The 5 ITP 1 fix commits on `sprint-5` are not in it yet**, so Owen merges them first, before anyone branches off (see 3.4).
- No Sprint 8 code has been committed yet.

### Priority tiers

| Tier | Issues | Rule |
|---|---|---|
| **1 — Release-critical foundation** | #133, #135, #136 | Must be merged into `Sprint-8` and verified by 2 Oct (6 Oct at the latest). Everything else builds on these. |
| **2 — Security features** | #46, #47, #48 | Work on personal branches. Merge when verified; anything unfinished on 6 Oct is carried into Sprint 9 with an owner and next step noted on #45. |
| **3 — Client-dependent** | #49, #134 | #49 is done when the draft is sent. #134's migration is prepared now but only applied after the client confirms where current/voltage are recorded. |

**Carry-over rule:** a feature branch existing is **not** "done". Done means merged into `Sprint-8` with working evidence (tests, screenshots or a test record). Anything not done by **Tue 6 Oct** is moved to Sprint 9 on the board with a comment on #45, and must not delay the Sprint 9 import and map work.

---

## 3. Who does what

| Member | GitHub | Sprint 8 focus | Issues |
|---|---|---|---|
| Alexander Liew | `heyalexahh` | Lead, database baseline, access matrix and client questions, reviews, applying migrations | #135, #49 |
| Gabriel Khoo | `GabrielKhoo` | Database function lockdown, PHP sessions, password recovery logic, current/voltage migration | #133, #48, #46, #134 |
| Bryce Teoh | `BryceTO` | Remember Me (with Gabriel), password recovery and change screens | #47 (+ UI for #46) |
| Owen Ngo | `MoeMaki33` | Branch sync, CI, removing secrets from the web root, test groundwork | #136 |

---

### 3.1 Alexander — lead and integration

**Day 1:** commit `CLAUDE.md` (repo root), `docs/IMPLEMENTATION_PLAN.md` and this file (`docs/sprints/SPRINT_08.md`) to `Sprint-8` so everyone, including Claude Code, can read them. `docs/` is currently gitignored, so use `git add -f` until #135 fixes `.gitignore` (once a file is tracked, later edits are picked up normally; only **new** files under `docs/` need `-f`).

**#135 Baseline Supabase migrations and commit manage-users function** (plan 0.2, 0.3, 0.6) — Tier 1

1. Fix `.gitignore` so `docs/`, `supabase/migrations/`, `supabase/functions/` and `supabase/config.toml` are tracked. Client data, `.env*` and `supabase/.temp` stay ignored.
2. Follow Supabase's existing-project workflow: `supabase link` → `supabase db pull` to create the baseline migration from the remote schema. **Review the generated file**: it must not contain the `backup_jalanban_*` tables (client data) or any secrets.
3. Test that the baseline rebuilds the database (tables, views, functions, policies, triggers, cron jobs): one local `supabase db reset` on your machine, then build the new empty staging project from it. **Docker is needed only on your machine, only for `db pull` and this one check** (decided 7 Oct); nobody else needs it.
4. Check the remote migration history with `supabase migration list`. `db pull` normally offers to record the baseline as applied. **Only use `supabase migration repair` if the list actually shows a mismatch**, and note why in the PR.
5. `supabase functions download manage-users` and commit it unchanged.
6. Move the 7 old SQL files into `supabase/legacy-sql/` with a short README.
7. Create the central config: `www/js/config/app-settings.js` for the browser-side provisional values (units, Z hidden, notifications off) and `www/php/app-settings.php` for the server-side session timeouts, so later changes are one-line edits.

Done when: the baseline is reviewed and committed, a local reset rebuilds the database, the remote migration history is consistent, and the function source is in git.

**#49 Agree Engineer/Admin/Super Admin access matrix with client** (plan 1.5) — Tier 3

1. Write `docs/security/access-matrix.md` describing what each role can do **today** (Claude Code can draft it from the code and RLS policies).
2. Email Zhen Qi the draft with these questions:
   - Is a Super Admin needed, and what would they do that an Admin can't?
   - Should engineers be able to delete readings? (You said yes in May; the app currently doesn't allow it.)
   - **Current and voltage:** what exactly is measured, in what units, and are they recorded **per test point** or **once per reading time for the location/rectifier** (like power is now)? Do they apply to fixed (stationary) test points too, or only variable ones?
   - **Power:** entered directly, calculated from current × voltage, or kept separately?
   - **Conductivity:** the July minutes record **mS/cm**. Please confirm that mS/cm still applies to the supplied Jalan Ban data. Its values range from 196 to 32,293, which would be unusually high in mS/cm, so the unit or the data may need checking.
   - **Relative coordinates:** origin, units, and whether Z is depth or elevation.
   - **Notifications:** are they wanted, and for which events and recipients?
3. Record the answers in `docs/decisions.md` as they arrive.

Done when: the matrix is in the repo and the email is sent. **Client approval is tracked as a Sprint 9 dependency, not a Sprint 8 deliverable.**

**Also this sprint:**
- **Create the staging project `cpm-staging`** (same organisation and region) as soon as the baseline exists, build it from `supabase/migrations/`, and create the test users (admin, engineer, inactive engineer). Share its connection string with the team privately (never in the repo); each person keeps it as `STAGING_DB_URL` in their untracked root `.env`. #133 and the RLS tests are tested there (plan 7.2, brought forward).
- Review and merge all personal-branch PRs into `Sprint-8`.
- Apply each reviewed migration to the live project. You are the only one who does this; take a backup first.
- Supabase Auth dashboard settings for #46: Site URL, redirect URLs, email templates, ideally custom SMTP.
- Turn on branch protection for `main`, `development` and `Sprint-8` once Owen's CI exists.
- At sprint end: merge `Sprint-8` into `development` (and into `main` when it's release-ready).

---

### 3.2 Gabriel — database and security

**#133 Lock down database functions** (plan 1.1) — Tier 1, *do this first*

Review **each** function individually rather than applying one blanket rule:

1. List every public function with who can execute it and whether it is `SECURITY DEFINER`.
2. For each one, decide which roles actually need it:
   - Internal summary functions (`backfill_daily_and_weekly_summaries`, `process_summary_refresh_queue`, `refresh_daily_summary`, `refresh_weekly_summary`, `queue_summary_refresh`), the trigger functions and `rls_auto_enable`: **no** API access (revoke from `public`, `anon` and `authenticated`). pg_cron and triggers keep working, because they don't need these grants.
   - App RPCs (manual reading create/update, weekly/daily summaries, asset map, positions): `authenticated` only. Grant per function, not schema-wide.
3. `SECURITY DEFINER` functions: set `search_path = ''` and schema-qualify every table and function reference inside (`public.users`, `public.test_points`, `auth.uid()`), as Supabase recommends. Where that isn't feasible in time, use `search_path = public, pg_temp` and note it in the PR as a follow-up.
4. Make `is_admin()` and `current_user_is_admin()` also require `is_active = true`.
5. Change the "Users read own profile" policy from `public` to `authenticated`.
6. Add `alter default privileges ... revoke execute on functions from public, anon` so new functions aren't exposed by default.

Test before Alex applies: on the staging project (apply your migration with `--db-url "$STAGING_DB_URL"`, never `supabase link`), sign in as admin, engineer and inactive engineer, plus no login, and confirm each screen still works for the right roles and the internal functions are denied.

Done when: applied and verified; the Supabase security advisor no longer shows the anon/authenticated SECURITY DEFINER or mutable search_path warnings; both roles can still use every screen.

**#48 Harden PHP sessions** (plan 1.4) — Tier 2

- **Identity comes only from Supabase, verified server-side.** `set-session.php` must verify the access token with Supabase (`/auth/v1/user`) and load the profile (`role`, `is_active`) **on login and on every refresh** before creating or updating the PHP session. It already does this on login; extend it to refresh. Never trust role, user id or expiry sent by the browser.
- The `remember` value from the browser is a **preference only**: the server decides the cookie lifetime and enforces the maximums below.
- `www/php/session-bootstrap.php`: strict mode, HttpOnly, SameSite=Lax, Secure on HTTPS, custom cookie name.
- `require_login()`: idle timeout, absolute timeout, session ID rotation, and periodic re-check of the stored token and profile (deactivated or role-changed users are logged out).
- **CSRF protection** on the state-changing endpoints (`set-session.php`, `clear-session.php`): POST only, same-origin `Origin`/`Sec-Fetch-Site` check, plus a CSRF token or required custom header. Include these in the tests.

**Agreed session policy (Gabriel and Bryce agree this on day 1; provisional values in config):**

| | Remember Me off | Remember Me on |
|---|---|---|
| Supabase session storage (browser) | `sessionStorage` (ends when the browser closes) | `localStorage` |
| PHP session cookie | browser-session cookie | persistent cookie |
| Idle timeout | 30 min | 30 min |
| Absolute maximum | 12 h | 14 days |
| Token refresh | browser posts the refreshed token to `set-session.php` (server re-verifies) | same |
| Sign-out | clears both storages and the PHP session | same |

**Test matrix (shared with #47):** browser restart, idle expiry, absolute expiry, token refresh, sign-out, account deactivation, role change, and a cross-site POST to `set-session.php` (must fail). Record the results in `docs/testing/session-tests.md`.

Done when: the test matrix passes and its results are recorded.

**#46 Password recovery and verified password change** (plan 1.2), logic part — Tier 2

- Recovery: `resetPasswordForEmail` with the correct redirect; handle valid, invalid and expired links on `reset-password.php`.
- Password change: **always** use the explicit email-code step: `reauthenticate()` → user enters the code → `updateUser({ password, nonce })`. Supabase's "Secure password change" setting only demands reauthentication when the last sign-in is older than 24 hours; our requirement is a code for **every** change, so the app enforces it itself.
- Test password change with **both** a freshly signed-in account and a session older than 24 hours (or simulate it).
- After a successful change, sign out other sessions. **Be accurate about what this does:** it revokes the other sessions' refresh tokens, but access tokens already issued (JWTs) stay valid until they expire (Supabase default 1 hour). Test and record what the app actually blocks during that window, combined with the PHP re-check from #48.
- Write `docs/security/auth-configuration.md` listing the dashboard settings Alex must switch on, and the JWT expiry setting (consider shortening it).

Done when: recovery and code-verified change both work and are recorded in a test record covering both session ages.

**#134 Current/voltage database schema** (plan 2.1) — Tier 3

- **Unblocked by the client's 5 Oct email:** current (A) and voltage (V) are **rectifier outputs**, so they go on `reading_batches` (once per reading time, like power), and **power is calculated as V × I**, not entered. See plan 2.1 and `docs/decisions.md`.
- Prepare the migration on your branch: nullable columns with range checks and unit comments; power set to `current_a * voltage_v` in the database when both are present; update `v_readings`; new versions of `create_manual_reading` / `update_manual_reading` with optional current/voltage parameters.
- Build it on top of the #135 baseline and test it on staging; Alex applies it after review.

Done when (for Sprint 8): the migration is reviewed, tested on staging and ready to apply, and existing manual entry is unaffected.

---

### 3.3 Bryce — frontend

**#47 Fix Remember Me** (plan 1.3) — Tier 2, together with Gabriel's #48

Remember Me is an **agreed session policy, not just a checkbox**: the Supabase browser session and the PHP session have separate lifetimes, and both must follow the table in 3.2.

- Give the checkbox on `index.php` an id and read it in `login.js`; set the storage preference **before** signing in.
- In `supabaseClient.js`, use a storage adapter: `localStorage` when ticked, `sessionStorage` when not; clear both on sign-out.
- Send the preference to `set-session.php` (Gabriel's endpoint decides the actual lifetime).
- Run the shared test matrix from 3.2 together with Gabriel.

Done when: the test matrix rows for Remember Me on and off pass and are recorded.

**#46 Password screens** (UI half of Gabriel's issue)

- `forgot-password.php`: email field, the same neutral message whether or not the account exists, and the button disabled for 60 seconds after sending. Point "Forgot password?" on `index.php` to it.
- `reset-password.php`: new password + confirm, the same rules as Settings, and success / invalid link / expired link states.
- Settings → change password in two steps: "Send verification code", then code + new password.
- Match the existing login page styling (Newcastle branding, toasts).

Done when: the screens work end to end with Gabriel's logic, with screenshots in the PR.

**If time allows:** read `testpoint-update.js`, `testpoint-view.js` and `history.js` to plan the current/voltage UI for Sprint 9 (#81).

---

### 3.4 Owen — QA and DevSecOps

**#136 Protect branches, merge sprint-5, add CI** (plan 0.1, 0.4, 0.5) — Tier 1

1. **Sync first (day 1, before others branch):** on `sprint-8-136-owen-sync` (from `Sprint-8`), merge `main` and then `sprint-5` (the 5 ITP 1 fix commits). Run `npm test`, open a PR into `Sprint-8` and ask Alex to merge it straight away, then tell the team they can branch. Note: `sprint-5` also adds `/output/` and `/tmp/` to `.gitignore`; keep both lines.
2. **Remove secrets and data from the web root:** move `www/scripts/import-jalanban.js` to `scripts/legacy/`, load `.env` from the repo root, fix the npm script path, and delete `www/js/dist/login.dev.js`. Add `www/.htaccess` blocking dotfiles, `.sql`, `.xlsx`, `.csv`, `/scripts`, `/data`, `/node_modules`, and add `.env.example`. Check that no `.env` or client spreadsheet exists under `www/` on anyone's machine or the server.
3. **CI:** `.github/workflows/ci.yml` running on PRs into `Sprint-*`, `development` and `main`: `npm ci` + `npm test`, `php -l` on all PHP files, a gitleaks secret scan, and `npm audit` (report-only for now). Write `docs/contributing.md` with the branching model (§5) and the branch protection settings for Alex.

Done when: `Sprint-8` contains the sprint-5 fixes, CI is green on a PR, and `http://localhost/.env` returns 403/404.

**Test groundwork (prepares #91 and #138):**
- Once Alex's staging project exists, check the test users (admin, engineer, inactive engineer) work there and add `STAGING_DB_URL=` to `.env.example`.
- Start `tests/db/rls-matrix.test.js` (runs only with `RUN_DB_TESTS=1`) to check allowed/denied actions per role.
- Start `docs/testing/defect-log.md` and `docs/testing/session-tests.md` (the template for Gabriel and Bryce's test matrix).

---

## 4. Order of work and dependencies

```
Day 1   Owen: merge main + sprint-5 into Sprint-8 → "OK to branch"
        Alex: commit CLAUDE.md + plan docs; start db pull baseline (#135)
        Gabriel + Bryce: agree session policy table (3.2)
        Gabriel: start #133 function review
Day 2   Gabriel: #133 tested locally → PR      Alex: review/apply #133; access matrix + client email (#49)
        Owen: secrets cleanup + CI              Bryce: #47 client side, password screens
Day 3-4 Gabriel: #48 sessions, #46 logic, #134 migration (not applied)
        Bryce: wire Remember Me to PHP, run test matrix with Gabriel
        Alex: auth dashboard settings, branch protection, merge PRs
        Owen: staging test users + RLS test skeleton
2 Oct   Sprint review: Tier 1 must be merged and verified
3-6 Oct Carry-over: finish Tier 2; anything left moves to Sprint 9 with a note on #45
```

- Nobody branches until Owen confirms `Sprint-8` includes the sprint-5 fixes.
- #135 should merge before other migrations are applied, so later migrations build on the baseline.
- #47 and #48 share `set-session.php` and `login.js`: agree the request format and policy on day 1.
- #46 needs Alex's Supabase Auth settings before it can be tested end to end.
- #134 waits on the client's answer to #49 before being applied.

---

## 5. How we work this sprint (branching)

```
main
 └─ development
     └─ Sprint-8                                        ← sprint integration branch
         ├─ sprint-8-133-gabriel-function-lockdown
         ├─ sprint-8-135-alex-db-baseline
         ├─ sprint-8-136-owen-ci-and-sync
         ├─ sprint-8-047-bryce-remember-me
         └─ ...
```

- Branch from `Sprint-8` as `sprint-8-<issue>-<owner>-<short-name>` (e.g. `sprint-8-133-gabriel-function-lockdown`).
- Open a pull request from your branch into **`Sprint-8`**, with `Closes #<issue>` (or `Part of #<issue>` if it's partial) in the description. Alex reviews and merges.
- At sprint end, Alex merges `Sprint-8` into `development`, and into `main` only when it's release-ready. Never push straight to `main` or `development`.
- Pull `Sprint-8` into your branch often, especially after Tier 1 merges.
- Migrations are new files in `supabase/migrations/`. **Only Alex applies them to the live project.** Each PR states "Migration to apply" and includes a rollback note.
- Run `npm test` before every push. Include screenshots for UI changes and link test records for security work.
- Never commit `.env`, the service-role key or client spreadsheets.
- Using Claude Code: *"Read CLAUDE.md and docs/sprints/SPRINT_08.md. Work on issue #<number>. Branch from Sprint-8 as sprint-8-<issue>-<owner>-<short-name> and open the PR into Sprint-8."*
- Move your issue card on the project board: Todo → In progress → Done.

---

## 6. Definition of done

Each item ends in exactly one of three states.

**A. Merged into `Sprint-8` and verified** (evidence attached to the PR or issue)
- [ ] #136 `Sprint-8` contains the sprint-5 fixes; CI runs on PRs; no secret/data paths under `www/`
- [ ] #135 Baseline reviewed and committed; local reset works; remote migration history consistent; `manage-users` source in git
- [ ] #133 Function lockdown applied; per-role checks pass; advisor warnings cleared
- [ ] #48 Session test matrix passes and is recorded *(or carried over)*
- [ ] #47 Remember Me rows of the matrix pass *(or carried over)*
- [ ] #46 Recovery and code-verified change recorded for new and >24 h sessions *(or carried over)*
- [ ] Branch protection on `main`, `development`, `Sprint-8`

**B. Submitted for client decision**
- [ ] #49 Access matrix draft + questions (Super Admin, engineer delete, current/voltage level and units, power, conductivity, X/Y/Z, notifications) sent to Zhen Qi
- [ ] #134 Migration reviewed and ready; waiting on the current/voltage placement answer (fallback decision by 9 Oct)

**C. Explicitly carried over to Sprint 9**
- [ ] Each unfinished item has a comment on #45: what's done, what's left, owner, next step, and dependency

The sprint is **not** "done" just because branches exist.

---

## 7. Risks

| Risk | What we do |
|---|---|
| Sprint ends 2 Oct with little started | Tier 1 first; carry-over to 6 Oct max; report blockers the same day |
| Revoking grants breaks a screen | Per-function review and per-role local test before Alex applies; rollback snippet in the PR |
| `db pull` baseline doesn't reset cleanly | Fix and re-pull before applying anything else; don't repair history blindly |
| A command meant for staging hits the live project | Staging is only ever targeted with `--db-url "$STAGING_DB_URL"`, never `supabase link`; only Alex runs commands against live, and takes a backup first |
| Recovery/code emails don't arrive (built-in email is rate-limited) | Alex sets up custom SMTP; test early with a team inbox |
| Existing JWTs still work after password change or deactivation | Document the window; PHP re-check + RLS `is_active` checks limit it; consider a shorter JWT expiry |
| Session changes log people out unexpectedly | Agreed policy table, values in config, shared test matrix |
| Client is slow to answer #49 questions | Keep current behaviour; fallback placement for current/voltage agreed by 9 Oct and recorded as provisional |

## 8. Hand-off to Sprint 9 (5–16 Oct)

Sprint 9 starts the client import page (#82, #83), the current/voltage screens (#81, depends on #134 and the client answer), the relative schematic (#84), security headers and the XSS fixes (#137), the notifications decision (#85), test data and scenarios (#138), and the demo build for the client meeting (#139). Client approval of the access matrix (#49) is tracked there.
