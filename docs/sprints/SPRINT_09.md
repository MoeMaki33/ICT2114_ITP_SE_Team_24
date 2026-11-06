# Sprint 9 — Integration, client deliverables and UAT fixes

**Dates:** 13 Oct – **6 Nov 2026 (development stops)** · re-planned 28 Oct  
**Milestone:** Milestone 3: ITP2 Build, Validation & Freeze  
**Parent issues:** #74 (Sprint 9), absorbing #75 (Sprint 10) and #76 (Sprint 11)  
**Sprint branch:** `sprint-9` (from `development` after Sprint 8 merged in #146)  
**Next client meeting:** **13 Nov 2026**  
**Full detail:** `docs/IMPLEMENTATION_PLAN.md`, `CLAUDE.md`, decisions in `docs/decisions.md`

---

## 1. Sprint goal

> **Ship a tested release candidate by 6 Nov: the client's import and schematic working, the Super Admin in place, the UAT feedback fixed, and the evidence the client and assessors need.**

The first UAT session with the client and engineers was held on **16 Oct**. Development stops on **6 Nov**; 7–12 Nov is documentation and the release candidate only; on **13 Nov** we demonstrate it to the client and record acceptance.

## 2. Where we are (28 Oct)

- `sprint-9` is identical to `development` (Sprint 8 merged on 13 Oct, #146). **Nothing has been merged since.**
- Ready to merge: Bryce's current/voltage screens (#148) and notifications (#147, approved at UAT), Gabriel's history fixes, Owen's security/CI branch (**needs PRs** for Gabriel's and Owen's branches).
- **CI doesn't run on `sprint-9` PRs yet**: the workflow only matches `Sprint-*`. Owen's branch adds `sprint-*`, so merge it first. No branch is protected yet.
- **The database baseline (#135) is not committed yet** (it is safe in Alex's local stash). Until it lands, `supabase/migrations/` can't build staging or a fresh database.
- **Not started:** client import (#82, #83), relative schematic (#84), Super Admin, shared XSS fix (#137 / 5.2), test data (#138), performance test (#94), role-access tests (#91).
- **UAT feedback from 16 Oct is not recorded yet** (#89); the defect log is empty.

## 3. Decisions that shape this sprint

| ID | Decision |
|---|---|
| D-ROLE-1 | **Super Admin confirmed.** Same permissions as Admin, plus managing Admins (and engineers). Admins manage engineers only. **Exactly one Super Admin**; the role only moves by a confirmed transfer. Built as an `is_super_admin` flag on an `admin` account. |
| D-NOTIF-1 | Basic in-app notifications **approved** at UAT; stay on. |
| D-MEAS-1/2 | Current and voltage are rectifier outputs per reading batch; power = V × I (database). |
| D-IMP-3 | The import accepts the **client's own spreadsheet layout** (Jalan Ban wide format). |
| D-XYZ-1/2 | X/Y in metres from a per-location origin; Z shown as a value only. Client to confirm on 13 Nov. |
| D-DATA-1 | Validation dataset: the 14 points of the client's drawing, 2 months of data based on Jalan Ban points 1–4. |

## 4. Priorities

### Tier 0 — unblock (by Thu 29 Oct)

| Task | Owner | Issue |
|---|---|---|
| Open the PR for Owen's branch and merge it first (fixes the CI trigger) | Owen → Alex | #136, #137 |
| Turn on branch protection for `main`, `development`, `sprint-9`: PR required, checks "Tests and PHP lint" and "Gitleaks" required, no force push (`docs/contributing.md`) | Alex | #136 |
| **Baseline PR**: commit the pulled schema without the `backup_jalanban_*` tables; guard the #133 backup-table policies; move the −850 mV threshold migration from `legacy-sql/` into the chain (baseline → threshold → #133 → #134); `supabase db reset` locally | Alex (Claude prepares) | #135 |
| Create `cpm-staging`, build it from the migrations, create the test users (Super Admin, Admin, engineer, inactive engineer) | Alex | #135, #138 |
| Apply the chain to live after it passes on staging (backup first) | Alex | #133, #134 |
| Merge #148, #147 and Gabriel's history branch (PR) | Alex | #81, #85 |
| **Record the UAT feedback**: one defect-log row and one `uat` issue per finding, with priority | Bryce (from Alex's notes) | #89 |

### Tier 1 — client deliverables and fixes (by Tue 3 Nov)

| Task | Owner | Issue |
|---|---|---|
| **Client import (minimal)**: admin page `import.php`; client wide format and long format; preview with validation and rejected rows (CSV download); `import_runs` table; chunked import RPC with duplicate skipping; result counts; rollback of a run; template download | Alex (Claude builds parser and page) + Gabriel (reviews migration and RPC) | #82, #83 |
| **Relative schematic (basic)**: "Site schematic" view on the asset map; test points by X/Y, coloured by status; click opens details; "not positioned" list; the 14 Jalan Ban points placed from the client's drawing | Alex (Claude builds) | #84 |
| **Super Admin**: flag + exactly-one rule + transfer RPC + role-change log (migration); `manage-users` checks caller level, `is_active`, valid roles, self-protection, ban on deactivate, CORS origin (plan 1.5); deactivate moves into `manage-users` (closes R12); Users page shows the right options and a transfer action; #48 re-check also loads the flag | Gabriel (DB + function), Bryce (Users page); Claude can draft | #49, #106 |
| UAT fixes, interface | Bryce | #105 |
| UAT fixes, security and integration | Gabriel | #106 |
| **XSS (5.2)**: shared `www/js/utils/html.js`; fix `history.js` and `notifications.js`; audit every `innerHTML` | Owen (after his branch merges, to avoid conflicts) | #137 |

### Tier 2 — evidence (by Thu 5 Nov)

| Task | Owner | Issue |
|---|---|---|
| Test data generator: the 14-point validation site (2 months) and a ≥100-test-point location (90 days) for staging and the import page | Owen (Claude can draft) | #138 |
| Performance run on staging, results in `docs/testing/performance-report.md` | Owen | #94 |
| Role-access tests (Super Admin, Admin, engineer, inactive, anonymous) → `docs/testing/rls-matrix-results.md` | Owen | #91 |
| Import and input-validation tests | Owen | #93 |
| Defect log and test results kept current | Owen | #95 |
| Optimise anything the performance run flags | Gabriel | #107 |

### Fri 6 Nov — development stops

Regression run (#111), code clean-up (#109), merge `sprint-9` into `development`, tag `v2.0.0-rc1` (#113). After this, fixes only for defects found in the regression run.

## 5. Day plan

| Day | Focus |
|---|---|
| Wed 28 – Thu 29 Oct | Tier 0: Owen's PR + branch protection; baseline PR; staging; merge #148, #147, history; UAT feedback recorded |
| Fri 30 Oct – Mon 2 Nov | Import, schematic, Super Admin built; UAT fixes; XSS sweep |
| Tue 3 Nov | Feature PRs merged; migrations on staging, then live |
| Wed 4 – Thu 5 Nov | Test data, performance run, role-access and import tests; fixes |
| Fri 6 Nov | Regression, clean-up, `v2.0.0-rc1`; development stops |

## 6. Merge order and avoiding conflicts

1. Owen's branch (touches `common.js`, `history.js`, `navigation-controller.js`, `set-session.php`, `session-bootstrap.php`, `testpoints.php`, `testpoint-view.php`) → 2. #148 → 3. #147 → 4. Gabriel's history branch → 5. baseline → 6. feature branches.
- New features go in **new files** where possible (`import.php`, `www/js/import/`, `www/js/schematic/`); navigation links are added after step 1.
- Pull `sprint-9` into your branch after each merge. Every PR goes into `sprint-9` with `Closes #<issue>`; no direct pushes.

## 7. UAT findings (16 Oct)

To be filled from Alex's session notes (#89). For each: what the engineer did, what went wrong or was asked for, priority (must / should / could), owner and issue.

| ID | Finding | Priority | Owner | Issue |
|---|---|---|---|---|
| UAT-01 | | | | |

## 8. After development stops (7–12 Nov)

Documentation and release only: architecture, database and API docs (#96), deployment, backup and rollback guide (#97), user manual and import guide (#98), test report (#99), release notes, known limitations and handover checklist (#100), demo build and rehearsal (#139, #61).

**13 Nov client meeting:** demonstrate the release candidate, record acceptance per deliverable (#101), and settle the open questions: who holds the Super Admin role at handover, whether engineers can delete readings, engineer visibility (all vs assigned points), the X/Y/Z definition, and whether some sites have more than one rectifier.

## 9. Definition of done (Sprint 9)

- [ ] CI runs on every `sprint-9` PR; `main`, `development` and `sprint-9` protected
- [ ] Baseline merged; staging built from migrations; #133, threshold and #134 applied to live
- [ ] Client import: the client's spreadsheet imports with a rejected-row report, re-import skips duplicates, a run can be rolled back
- [ ] Schematic shows the 14 points and opens their details
- [ ] Exactly one Super Admin enforced by the database; only the Super Admin manages Admins; transfer works
- [ ] Every UAT finding recorded, and each one fixed or explicitly deferred
- [ ] No unescaped data in `innerHTML` (5.2)
- [ ] Performance, role-access and import test results recorded
- [ ] `v2.0.0-rc1` tagged on 6 Nov

## 10. Risks

| Risk | What we do |
|---|---|
| Too much for 8 working days | Cut in the plan's order (§6 of the plan): Super Admin transfer screen → import extras → schematic extras → page timings. Never cut the baseline, import core, one-Super-Admin rule or 5.2 |
| Merge conflicts between parallel branches | Merge order in §6; new features in new files; small PRs |
| Migrations break on live | Staging first, backup before applying, rollback file per migration |
| UAT feedback lost | Record it first (Tier 0) |
