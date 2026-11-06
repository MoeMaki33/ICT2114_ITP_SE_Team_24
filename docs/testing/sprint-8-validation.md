# Sprint 8 validation — 7 October 2026

Branch: `sprint-8-136-owen-ci-security`, based on `origin/Sprint-8` at
`8160149`. Worktree was clean before work. GitHub account: `MoeMaki33`.

## Assessment

- #136 is open, assigned to Owen; its issue body is empty.
- PR #141 (sprint-5 sync) is open and unmerged. It already contains the sync
  implementation; it is not duplicated here.
- PR #142 is the access-matrix/decisions work; PR #143 is #135 preparation,
  explicitly excluding the database baseline. Intended merge order is #141,
  #142, #143. Alex's baseline still needs a later PR.
- Current Sprint-8 lacks the web-root cleanup and CI; these independent changes
  are prepared here. Teammate feature branches are not merged or overwritten.
- RLS groundwork waits on the baseline. Session behavior waits on Gabriel and
  Bryce's integration. Branch protection is documented for Alex to apply.

## Executed checks

| Check | Actual result |
| --- | --- |
| `npm ci` | PASS: 19 packages installed from the existing lockfile |
| `npm test` | PASS: 52 tests, 0 failures |
| Fixed-threshold regression tests | PASS: five cases covering all requested mV boundaries, stale overrides, create/edit/import payloads, manual fallback snapshots, repository audit preservation and stale RPC status |
| JavaScript syntax | PASS: changed JS files and relocated legacy importer checked with `node --check` |
| PHP lint | PASS: all 16 tracked PHP files, PHP 8.0.30 |
| Apache config | PASS: syntax check with Apache 2.4.58 |
| Apache restricted paths | PASS: 403 for `/.env`, `/.htaccess`, `/js/.env`, `/test.sql`, `/test.xlsx`, `/test.csv`, `/scripts/import-jalanban.js`, `/data/probe`, `/node_modules/probe` |
| Apache legitimate assets | PASS: `/js/services/status.js` and `/css/style.css` returned 200 |
| Gitleaks 8.30.1 staged-source scan | PASS: 0 findings using project config |
| Gitleaks Git history scan | PASS: 100 commits scanned, 0 findings using project config |
| Tracked private files | PASS: no tracked `.env`, `.csv` or `.xlsx`; root/public `.env` and validation artifacts are gitignored |
| `git diff --check` | PASS |
| `npm audit` | REPORT: one high-severity vulnerable dependency, `xlsx`; exit 1 retained as report-only |

Audit advisories: SheetJS prototype pollution
([GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6))
and ReDoS ([GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)).
Dependency replacement belongs to planned Sprint 9 hardening; versions and
lockfile are unchanged here.

Default Gitleaks findings were reviewed without printing key values: all four
Git-history findings were `sb_publishable_` browser keys. The source scan also
found examples in the downloaded scanner's README, which is outside the tracked
source. Final source scanning used a snapshot of tracked/staged files, excluding
ignored validation tools. `.gitleaks.toml` retains all default rules and allows
only the public Supabase publishable-key format. Secret keys and service-role
JWTs are not excluded. CI uses the same scanner version.

Apache checks used an isolated server bound to `127.0.0.1:18508` with the
repository's `www/` as DocumentRoot and AllowOverride enabled. The PHP built-in
server does not enforce `.htaccess`; these results apply to Apache.

## Not executed / follow-up

- GitHub-hosted workflow: NOT RUN locally; inspect both checks on the draft PR.
- Database migration/RPC/summary rebuild: BLOCKED by the missing #135 baseline
  and approved non-production environment; see `fixed-threshold.md`.
- RLS role matrix: BLOCKED; see `rls-groundwork.md`.
- Session integration and authenticated UI/screenshots: NOT RUN; no test
  accounts/browser session were used. `session-tests.md` contains the template.
- Branch protections: NOT APPLIED; Alex must configure them after CI exists.
- Sprint-5 fixes: not yet integrated; Alex must merge existing PR #141.

No live Supabase reads/writes or migrations were performed. #136 must remain
open until integration, CI evidence and branch protections are complete.

## Migration to apply

Sprint 8 security/CI changes: none.
Fixed-threshold task: `20261007000000_fix_protection_threshold.sql`, prepared
for Alex's review only, with additional baseline-dependent function/summary
review required before application.
