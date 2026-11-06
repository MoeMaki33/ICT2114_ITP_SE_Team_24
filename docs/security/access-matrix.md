# Access matrix — Engineer / Admin / Super Admin

**Status:** Roles **confirmed by the client** (Super Admin confirmed, recorded 28 Oct 2026); rows marked ❓ still open · **Issue:** #49 · **Updated:** 28 Oct 2026 by SE Team 24 · **Decisions:** D-ROLE-1, D-ROLE-2, D-IMP-1 (`docs/IMPLEMENTATION_PLAN.md` §3, `docs/decisions.md`)

This document describes **who is allowed to do what** in the Corrosion Protection Monitoring application. The team builds and tests against it: every row is checked for each role (allowed and denied) and the results are recorded in `docs/testing/rls-matrix-results.md` (evidence B3).

## 1. The three roles

| Role | Purpose | Typical holder | Granted by |
|---|---|---|---|
| **Corrosion Engineer** | Day-to-day monitoring: view status, history and maps; enter readings | Field and office corrosion engineers | Admin or Super Admin |
| **Admin** | **Operations owner:** runs the asset register, data imports, data corrections and engineer accounts | Engineering lead / data administrator | Super Admin only |
| **Super Admin** | The same permissions as an Admin, **plus managing Admins** | The client's system owner. **There is exactly one Super Admin** | Transfer from the current Super Admin only |

The rule underneath: **you can only manage accounts below your own level.** An Admin manages engineers; only the Super Admin manages Admins. Nobody can change their own role or deactivate their own account.

Legend: ✅ allowed · ❌ not allowed · 👁 view only · ❓ needs client decision · **New** = not in the app yet (planned)

## 2. Monitoring

| Action | Engineer | Admin | Super Admin | Notes |
|---|---|---|---|---|
| View dashboard, weekly summary, history and test point details | ✅ | ✅ | ✅ | Engineers currently see **all** locations and test points; the Test Points list defaults to the ones assigned to them ❓ |
| View the GPS asset map and the relative site schematic | ✅ | ✅ | ✅ | Schematic is new in Sprint 9 |
| Export reading history to CSV | ✅ | ✅ | ✅ | |
| Export the test point list to Excel | ❌ | ✅ | ✅ | |
| Customise own dashboard layout | ✅ | ✅ | ✅ | Each user's own layout only |

## 3. Readings

| Action | Engineer | Admin | Super Admin | Notes |
|---|---|---|---|---|
| Enter a reading manually (potential, environment, current and voltage) | ✅ | ✅ | ✅ | Power is calculated as voltage × current. A second reading for the same test point within 1 minute is rejected as a duplicate |
| Edit a reading they entered, within 1 hour of entering it | ✅ | ✅ | ✅ | Imported readings can't be edited this way |
| Edit any other reading (other users', older than 1 hour, imported) | ❌ | ✅ | ✅ | Data corrections are an Admin task |
| Delete a reading | ❌ ❓ | ✅ | ✅ | On 18 May the client said engineers can be allowed to delete readings. Proposed: engineers may delete **their own** manual readings within 1 hour, like editing |

## 4. Data imports (new in Sprint 9)

| Action | Engineer | Admin | Super Admin | Notes |
|---|---|---|---|---|
| Import readings from a spreadsheet | ❌ | ✅ | ✅ | Admins only (18 May). Same layout as the client's spreadsheet (5 Oct) |
| Review the import preview, rejected rows and duplicates before confirming | ❌ | ✅ | ✅ | **New** |
| View import history and reconciliation reports | 👁 | ✅ | ✅ | **New** |
| Roll back an import | ❌ | ✅ | ✅ | **New**. Removes only the readings from that import |

## 5. Assets

| Action | Engineer | Admin | Super Admin | Notes |
|---|---|---|---|---|
| Create, edit, activate/deactivate test points; import test points from Excel | ❌ | ✅ | ✅ | |
| Replace a test point (new identifier linked to the original, history kept) | ❌ | ✅ | ✅ | **New** (client requirement, 5 Oct) |
| Create and edit locations | ❌ | ✅ | ✅ | |
| Set or change test point positions (GPS and relative X/Y/Z) | 👁 | ✅ | ✅ | Engineers can view positions and position history |
| Record equipment replacements / versions | 👁 | ✅ | ✅ | |
| Protection threshold | 👁 | 👁 | 👁 | Fixed at **−850 mV** for every test point (client, 4 Jun); no role changes it |

## 6. Accounts

| Action | Engineer | Admin | Super Admin | Notes |
|---|---|---|---|---|
| Create and delete **engineer** accounts; deactivate/reactivate engineers | ❌ | ✅ | ✅ | As agreed on 18 May; delete confirmed 29 Oct |
| Create and delete **Admin** accounts; promote an engineer to Admin; demote or deactivate an Admin | ❌ | ❌ | ✅ | Today any Admin can do this; this is the only current Admin permission that moves |
| Create a second Super Admin | ❌ | ❌ | ❌ | There is exactly one Super Admin |
| Transfer the Super Admin role to another account | ❌ | ❌ | ✅ | **New**. See section 8 |
| Change own role or deactivate own account | ❌ | ❌ | ❌ | Prevents locking everyone out |
| Change own password (confirmed with a code sent by email) | ✅ | ✅ | ✅ | |
| Reset a forgotten password by email | ✅ | ✅ | ✅ | |
| Deactivated accounts | Can't sign in; any open session ends within 5 minutes | | | |

## 7. Outside the app

| Action | Engineer | Admin | Super Admin | Notes |
|---|---|---|---|---|
| Change units, alert thresholds or enabled features | ❌ | ❌ | ❌ | Fixed in the app's configuration; changed by the support team in a release |
| Database backups, restores and schema changes | ❌ | ❌ | ❌ | Stay with the hosting owner (Supabase project) |

## 8. Super Admin rules

1. **Exactly one Super Admin, always.** The system rejects anything that would create a second one or leave none.
2. **The Super Admin can't be demoted, deactivated or deleted directly**, including by themselves. The role only moves by transfer.
3. **Transfer in one step.** The Super Admin chooses an active Admin and confirms with a code sent by email. In one step that Admin becomes the Super Admin and the previous Super Admin becomes an Admin. The previous holder can then be deactivated by the new Super Admin if they are leaving.
4. **Every role change is logged**: who changed which account, from which role to which, and when.
5. **Emergency recovery.** If the Super Admin account is lost (for example, the person left without transferring it), the hosting owner reassigns it directly in the database, following the procedure in the handover guide.

## 9. Questions for the client

1. **Super Admin holder:** who should hold the role at handover?
2. **Deleting readings:** should engineers be able to delete only their own recent manual readings (as proposed), or any reading?
3. **Visibility:** should engineers see all locations and test points, or only those assigned to them?

## Change log

| Date | Change | By |
|---|---|---|
| 29 Oct 2026 | Admins may delete Engineer accounts; the Super Admin may create and delete Admins and Engineers | SE Team 24 |
| 28 Oct 2026 | Super Admin confirmed: same as Admin plus managing Admins, exactly one holder, transfer only; removed the proposed settings, audit and clean-up powers | SE Team 24 |
| 13 Oct 2026 | Three-role proposal: role purposes, Admin as operations owner, Super Admin governance and succession rules, imports and system settings sections, fixed −850 mV threshold | SE Team 24 |
| 7 Oct 2026 | Added proposed Super Admin column (client recommendation of 5 Oct) and the 18 May role description | SE Team 24 |
| 7 Oct 2026 | First draft from current app behaviour and agreed decisions | SE Team 24 |
