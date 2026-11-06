# Decision log

Client and team decisions, newest first. Each entry links to the decision register in `docs/IMPLEMENTATION_PLAN.md` §3, which holds the current state. Sources are emails or meeting minutes; client attachments (spreadsheets, drawings) are kept outside the repo.

| Date | Source | ID | Decision | Affects |
|---|---|---|---|---|
| 29 Oct 2026 | Alex (team) | D-ROLE-1 | Admins may delete Engineer accounts; Super Admin may create/delete Admins and Engineers. Confirms Owen's canDeleteUser rule. | #49, access matrix |
| 28 Oct 2026 | Team | — | **Schedule change:** Sprint 9 runs until **development stops on 6 Nov** and absorbs the Sprint 10 and 11 work (UAT fixes, evidence); 7–12 Nov documentation and release candidate; next client meeting **13 Nov**. Client import (D2) and a basic relative schematic (D3) are still built in Sprint 9 in minimal form | Plan §6, `docs/sprints/SPRINT_09.md` |
| 28 Oct 2026 (recorded) | Client (confirmed to Alex) | D-ROLE-1 | **Super Admin confirmed:** same permissions as Admin, plus managing Admins and engineers. Admins manage engineers only and cannot manage Admins. **Exactly one Super Admin.** Replaces the 13 Oct proposal (no separate system-settings or audit powers; one holder instead of two) | #49, `manage-users`, admin page, #48 |
| 16 Oct 2026 | UAT session with client and engineers | D-NOTIF-1 | Basic in-app notifications **approved**; feature stays on (#147) | #85, config |
| 16 Oct 2026 | UAT session with client and engineers | — | First face-to-face UAT held; feedback to be recorded in the defect log and as `uat` issues (#89) | #87, #89, #105 |
| 13 Oct 2026 | Team (proposal, superseded 28 Oct) | D-ROLE-1 | Three roles: Engineer, Admin (operations owner) and Super Admin (Admin + Admin accounts, system settings, ownership transfer, audit log). Only one current Admin permission moves: managing other Admins. Succession: always ≥1 active Super Admin, two recommended, transfer in one email-confirmed step, role changes logged. Built as a flag on Admin accounts | #49, access matrix, later #133/#48 follow-up |
| 7 Oct 2026 | Team | — | Team testing (migrations, RLS, UAT) happens on a separate **staging** Supabase project; Docker only on Alex's machine for the one-off `db pull` baseline | #135, #133, plan 7.2 |
| 5 Oct 2026 | Zhen Qi (email, review of Scope of Work §3) | D-MEAS-1 | Current and voltage are **rectifier outputs**, stored in A and V | #134, #81 |
| 5 Oct 2026 | Zhen Qi | D-MEAS-2 | **Power is calculated** (W = V × I), not entered manually | #134, #81 |
| 5 Oct 2026 | Zhen Qi | D-MEAS-3, D-MEAS-4 | Units: potential mV, temperature °C, conductivity **µS/cm**, pH unitless, dissolved oxygen mg/L | config, #81 |
| 5 Oct 2026 | Zhen Qi | D-XYZ-1/2 | The team must **clearly define the X, Y, Z reference system** before implementing it; GPS remains the preferred mapping source, drawings and relative coordinates support schematic validation | #84 |
| 5 Oct 2026 | Zhen Qi | D-ROLE-1 | A **Super Administrator** role is recommended for user management, system configuration and database administration (scope to agree) | #49, #133 |
| 5 Oct 2026 | Zhen Qi | D-ENV-1 | Environmental alert thresholds at **20% day-to-day** would be useful (parameters to confirm) | #85, config |
| 5 Oct 2026 | Zhen Qi | D-TP-1 | A replacement test point gets a **new identifier**, keeps history and stays linked to the original | Sprint 9/10 |
| 5 Oct 2026 | Zhen Qi | D-IMP-3 | Import template should match the **client's existing spreadsheet** layout | #82, #83 |
| 5 Oct 2026 | Zhen Qi | D-DATA-1 | Validation dataset: **10–15 test points, 2 months**; approximate values from Jalan Ban points 1–4; client supplied a 14-point reference drawing and an updated spreadsheet with Voltage/Current/Power columns | #138 (7.1) |
| 5 Oct 2026 | Zhen Qi | D-UAT-1 | Cannot attend 21 Oct; prefers "next week after 4pm", then away for a month; will bring a corrosion engineer. **Date to confirm** | #139, 7.3 |
| 13 Jul 2026 | Zhen Qi (email) | — | Test point names unique within a location; separate notes for locations and test points; no pipe-line drawing (assets aren't always pipelines); show fixed vs variable; environment and trend graphs on one page | Built in ITP 1 |
| 4 Jun 2026 | Zhen Qi (email) | — | **≤ −850 mV is Protected**, > −850 mV Unprotected; suggested relative 3D coordinates from an absolute point such as the pipe starting point (0,0,0) | Status rules, #84 |
| 18 May 2026 | Zhen Qi (email) | D-IMP-1, D-ROLE-2 | Admins: user accounts (create/edit/delete engineers), settings, all data, create test points, file uploads. Engineers: enter/upload/view readings and dashboards; "can be allowed to add, edit and delete test point readings" | #49 |
| 8 May 2026 | Zhen Qi (kick-off) | — | MoSCoW requirements; image display is "won't have"; test point replacement flagged as a technical challenge | Scope |
