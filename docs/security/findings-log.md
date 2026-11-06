# Security findings log (internal — do not send to the client as-is)

Evidence B4. Every finding has an owner issue, a status, the fixing commit/PR and a retest result. R1–R11 come from the 1 Oct review (`docs/IMPLEMENTATION_PLAN.md` §2.3); R12 onwards were found while drafting the access matrix (#49) on 7 Oct.

File references point at `Sprint-8` as of 7 Oct 2026. Several findings depend on database policies that are **not in the repo yet**; they are marked "verify" and are checked against the baseline from #135.

Severity: **H** exploitable by a signed-in user against data or other users · **M** weakens a control or depends on an unverified one · **L** hygiene.

| ID | Sev | Finding | Fix in | Status | Fix PR | Retest |
|---|---|---|---|---|---|---|
| R1 | H | `anon` can execute SECURITY DEFINER maintenance functions with no auth check; 6 functions have a mutable `search_path` | #133 | Open | | |
| R2 | H | `is_admin()` and `manage-users` don't check `is_active`; deactivation doesn't revoke sessions; no server-side self-demotion guard; role not validated | #133, #49 (1.5) | Open | | |
| R3 | H | Import script expects `www/.env` (service-role key) and `www/data/*.xlsx` inside the web root | #136 | Open | | |
| R4 | M | PHP session: no timeouts, no cookie flags, no re-validation, no CSRF/origin checks | #48 | Open | | |
| R5 | M | "Forgot password?" links to `#`; Remember Me not wired; password change has no reauthentication | #46, #47 | In progress (Bryce's branches) | | |
| R6 | H | Stored XSS: `history.js` 974–983 and `notifications.js` 37–43 put DB values into `innerHTML` unescaped | #137 (5.2) | Open | | |
| R7 | M | `xlsx@0.18.5` (known CVEs) parses uploads; CDN scripts unpinned, no SRI; dead `www/js/dist/login.dev.js` | #137 (5.3), #136 | Open | | |
| R8 | M | Schema not reproducible from the repo; Edge Function not versioned | #135 | In progress | | |
| R9 | L | Conductivity unit (mS/cm) vs stored magnitudes (196–32,293) | #49, #81 | Waiting on client | | |
| R10 | M | Readings import per test point, one RPC call per row, not transactional, no reject report | Phase 3 (#82) | Open | | |
| R11 | L | Redundant indexes on `reading_batches`; history loads raw rows client-side | #107 (8.3) | Open | | |
| R12 | M | Activate/deactivate user is a **direct `users` update** from the browser (`admin.js` `toggleActive`), not via `manage-users`. **Verified against the baseline (13 Oct):** there is no self-update policy, so engineers cannot change their own `role`; the only write policy is "Admins manage all users" (`FOR ALL ... using is_admin()`), so any active Admin can change any user row directly, including `role`, `is_active` and their own row (the self-guards are UI-only). Acceptable with two roles; **must be closed before a Super Admin exists**, otherwise an Admin could promote themselves via the API. Fix: route all user changes through `manage-users` (or an RPC) with level checks, and guard the role/Super Admin columns with a trigger. | Super Admin work (D-ROLE-1), plan 1.5 | Fixed (staging, 3 Nov); live pending | `20261028100000_super_admin.sql` drops "Admins manage all users" and adds the guard trigger; `admin.js` routes activate/deactivate through `manage-users` (#49) | Staging 3 Nov: test:db "R12: the browser cannot write to users directly, even as an admin" passes (18/0/1); retest on live after go-live |
| R13 | H (verify) | Legacy page `testpoint-update.php?id=…&reading=…` is reachable by URL for any signed-in user and has no ownership or 1-hour check in the browser (`testpoint-update.js` 204–245). It calls `update_manual_reading` and, if that RPC is missing, falls back to direct table updates (268–308). Safety depends entirely on the RPC/RLS. The page's links in `testpoint-view.js` are dead code. | #133 (verify), then remove or gate the page (ask before deleting) | Verify against baseline | | |
| R14 | M (verify) | The 1-hour "edit own reading" rule is only enforced in the browser in the repo (`testpoint-view.js` 1234–1243), and the window is measured from `reading_ts` (when measured), not `created_at` (when entered), using the client clock. The RLS file the code cites (`allow_recent_manual_reading_edits.sql`) is in no branch. Edits are direct table UPDATEs (1313–1347). | #133 (DB rule), #81 (client uses `created_at`) | Verify against baseline | | |
| R15 | M | Per-test-point readings import is shown to engineers (`testpoint-view.js` 1930) although imports are admin-only (D-IMP-1). | Phase 3 (3.3 retires it); interim: hide for engineers | Open | | |
| R16 | L | Deleting a reading deletes only the `test_point_readings` row and leaves its `reading_batches` row (environment values) behind (`testpoint-view.js` 2589–2593). | #108 / 8.4 | Open | | |
| R17 | M (verify) | All UI role checks read `localStorage.userRole`, which a user can edit. Admin-only actions (test points, locations, equipment, delete reading, export) are therefore only as strong as their RLS policies, most of which are not in the repo. | #133 + RLS matrix test (1.5) | Verify against baseline | | |
| R18 | M | In-app (PJAX) navigation doesn't re-run `autoGuard`, and the PHP session never re-checks `is_active`/role after login, so a deactivated user keeps access until a full page load. | #48 | Open | | |
| R19 | L (verify) | `dashboard_layouts` RLS is not in the repo; the app filters by `user_id` client-side. Confirm a user can't read/write another user's layout. | #133 | Verify against baseline | | |
| R20 | — | Engineers can read every test point; "assigned to me" scoping exists only on the Test Points page. Not a defect unless the client says engineers should only see assigned points (access-matrix question 3). | #49 | Waiting on client | | |
