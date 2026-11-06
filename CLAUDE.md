# CLAUDE.md — Corrosion Protection Monitoring (SE_16 / SE Team 24)

Read this first, then `docs/IMPLEMENTATION_PLAN.md` and the current sprint file in `docs/sprints/` (now `docs/sprints/SPRINT_09.md`). The plan is the source of truth for **what** to build, the sprint file for **who does what this sprint**, and this file for **how** to work in this repo.

## What this project is

A web application for **corrosion protection (cathodic protection) monitoring** built for Newcastle University in Singapore (industry supervisors: Chee Zhen Qi, Zi Jie Choong) as SIT ICT2114 Integrated Team Project, SE Team 24.

Engineers use it to see whether test points on assets (pipelines, tanks, ships, rigs) are protected, review history and environmental trends, find locations that need attention, and enter or import readings. Admins manage users, locations, test points, coordinates and imports.

ITP 1 (May–Jul 2026) delivered a working prototype. **ITP 2 (31 Aug – 22 Nov 2026) is about stabilising, securing, validating and handing it over**, not adding big new features. **Development stops on 6 Nov 2026**; 7–12 Nov is documentation and the release candidate only; the next client meeting is **13 Nov 2026**.

## Stack and layout

- PHP pages (no templating) that serve plain HTML/CSS/vanilla JS. PHP is used for server-side session gating only.
- Supabase: Postgres + Auth + RLS + one Edge Function (`manage-users`). The browser talks to Supabase directly with the **publishable** key (public by design; security comes from RLS).
- Chart.js, SheetJS (`xlsx`), Google Maps JS API, Font Awesome — loaded from CDNs.
- No bundler, no framework. Keep it that way.

```
www/                    Apache DocumentRoot (everything here is web-reachable)
  *.php                 pages; each protected page starts with session-guard + require_login()/require_role('admin')
  php/                  session-guard.php, set-session.php, clear-session.php, config.php, asset-version.php
  js/                   page scripts; js/repositories/supabase-repositories.js = data access layer
  css/style.css
supabase/migrations/    SQL migrations (see "Database rules")
supabase/functions/     Edge Functions (manage-users must be committed here)
tests/                  node:test unit tests (pure logic modules)
scripts/                Node CLI tools (must live OUTSIDE www/)
docs/                   plan, guides, security/testing docs (must NOT be gitignored)
  sprints/              one file per sprint (SPRINT_08.md, ...)
CLAUDE.md               this file (repo root, so Claude Code loads it automatically)
```

Testable pure-logic modules follow the existing pattern in `www/js/weekly-location-aggregator.js`: plain script that attaches to `window` in the browser and exports via `module.exports` when `module` exists, so `tests/*.test.js` can `require()` it.

## Commands

```bash
npm install            # supabase-js, xlsx, dotenv for Node tools/tests
npm test               # node --test "tests/*.test.js" — must pass before every commit
npm run serve          # php -S localhost:5500 -t www  (or XAMPP Apache pointed at www/)
npx supabase <command> # Supabase CLI without a global install
```

**Database environments:** `live` (`pscwapylbjvulvsszdur`, the client's data, only Alex touches it) and `staging` (`cpm-staging`, synthetic data, where the team tests migrations, RLS and UAT). Docker is **not** part of the app and nobody needs it, except Alex for the one-off `supabase db pull` baseline. A local Docker stack (`supabase start`) is optional.

## Domain rules (do not change without the plan's decision register)

- Protection criterion: a reading **≤ −850 mV is Protected**, above is Unprotected; no reading = Unknown/No Data. Threshold is stored per test point (`threshold_mv`) and snapshotted per reading (`threshold_mv_snapshot`). Values are negative millivolts; never flip signs.
- Time zone: **Asia/Singapore** for display, weekly/daily summaries and imports without an explicit offset. Store `timestamptz`.
- Roles (DB check constraint): `admin`, `corrosion_engineer`, plus **one Super Admin** (confirmed, D-ROLE-1): an `admin` account with `is_super_admin = true`. Super Admin = Admin permissions + managing Admins; Admins manage engineers only; there is always **exactly one** Super Admin, changed only by a confirmed transfer. All user changes go through `manage-users`, never direct `users` updates from the browser.
- Duplicate reading rule: same test point within 1 minute = duplicate (enforced in `create_manual_reading`).
- Test point types: `stationary` (fixed/galvanic, no power input) and `variable` (impressed-current, has power input). Power is hidden for stationary points (July rule).
- Electrical measurements (client, 5 Oct): current (A) and voltage (V) are **rectifier outputs** stored once per reading batch (`reading_batches`), and **power (W) is calculated as V × I**, never entered by hand when both are present.
- Units (client, 5 Oct): potential mV, temperature °C, conductivity **µS/cm**, pH unitless, dissolved oxygen mg/L.
- Provisional values (units, Z meaning, notifications, etc.) live in one config module (`www/js/config/app-settings.js`, see plan §3). Never hard-code them in pages.

## Working rules

1. **Work issue by issue.** Every task in the plan has a GitHub issue number. Each sprint has an integration branch created from `development` (e.g. `Sprint-8`). Branch from the current sprint branch as `sprint-<n>-<issue>-<owner>-<short-name>` (e.g. `sprint-8-133-gabriel-function-lockdown`), reference the issue in commits, and open a PR into the sprint branch with `Closes #<issue>`. Alex merges the sprint branch into `development`, and into `main` at release. Never push directly to `main`, `development` or the sprint branch. The current sprint's file is in `docs/sprints/`.
2. **Database rules.**
   - Every schema/function/policy change is a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`, idempotent where practical (`create or replace`, `if not exists`, `drop policy if exists`).
   - **Never run `supabase db push`, `supabase db reset --linked`, or any SQL against the live project (`pscwapylbjvulvsszdur`).** Alex reviews and applies migrations. Test on **staging**: target it explicitly with `--db-url "$STAGING_DB_URL"` (from your untracked root `.env`), and **never `supabase link` to staging**, so a command can't land on the wrong project. A local stack is fine if you have Docker. Otherwise describe manual verification steps in the PR.
   - Every new function sets an explicit `search_path`. Prefer `security invoker` (`search_path = public, pg_temp` is fine). If `security definer` is required: `set search_path = ''` and schema-qualify every reference (`public.users`, `auth.uid()`); where that isn't feasible in time, use `public, pg_temp` and log a follow-up in the PR. Check `auth.uid()` + role/is_active inside it, `revoke execute ... from public, anon`, and grant only to the roles that need it.
   - Every new table: `enable row level security` + explicit policies for `authenticated` only.
3. **Security coding rules.**
   - Never interpolate data into `innerHTML` without `escapeHtml()` (shared helper `www/js/utils/html.js`, created in plan task 5.2; until then use the page's local `escapeHtml`). Prefer `textContent`.
   - No secrets in the repo. The service-role key, `.env`, client spreadsheets and exports never get committed and never go under `www/`.
   - Do not commit client data (e.g. `JalanBan_ITP.xlsx`). Use `data/` (gitignored) locally, or synthetic data from `scripts/generate-synthetic-data.js`.
   - Pin CDN versions; add SRI hashes where the CDN supports it.
4. **Tests.** Add/extend `node:test` tests for any pure logic you touch (parsers, validators, status/aggregation, layout math). DB/RLS integration tests are gated behind `RUN_DB_TESTS=1` and run against staging (or a local stack), never the live project.
5. **Keep the UI consistent** with existing components and `css/style.css` (Newcastle University branding). Reuse table, toast, modal and chart helpers.
6. **Ask before** deleting files, changing the role model, changing threshold semantics, or anything listed as a client decision in the plan.
7. When a task is done: tests pass, PR description lists what changed, how it was verified, any migration to apply, and screenshots for UI changes.

## Team (GitHub logins)

Alexander Liew `heyalexahh` (lead, integration, relative map, client) · Gabriel Khoo `GabrielKhoo` (DB, security, backend, import) · Bryce Teoh `BryceTO` (frontend, UX) · Owen Ngo `MoeMaki33` (QA, DevSecOps, docs).
