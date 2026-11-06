# Week 9 security review — 24 October 2026

Update: the original XLSX audit finding below is resolved in source by the official 0.20.3 distribution. See [dependency remediation and verification](dependency-remediation.md). Earlier findings/results below describe the initial Week 9 baseline.

Status: **partially implemented**, not a whole-application security certification. No live DB, GitHub administration or production deployment was changed.

## Route / boundary inventory

| Surface | Inputs and boundary | Queries / sinks | Controls and outstanding checks |
| --- | --- | --- | --- |
| index, forgot-password, reset-password | Public PHP pages; Supabase browser auth | Auth forms / recovery URLs / session handshake | Shared response headers; existing password-flow tests pass; actual provider templates/configuration pending |
| dashboard, weekly, history, asset-map | PHP require_login; browser Supabase token/RLS | Filters, RPCs, charts, table templates | Existing logic/layout tests; history stored labels encoded; live RLS and browser regression not run |
| testpoints, testpoint-view, testpoint-update | Page/session role gate plus browser role checks | UUIDs, dates, numerics, assignment, notes, spreadsheet files; Supabase repositories and manual RPC | New API validates independently; existing manual/Excel paths retained; complete DB-side validation/access review remains pending |
| admin/settings | Session gate; admin page require_role; manage-users Edge Function | Profile/user/preference changes | Existing tests pass; no live user-management changes; review deployed Edge Function and RLS separately |
| php/set-session.php, clear-session.php | Cookie session; POST/custom-header/same-origin protection | Token/profile GET via publishable key and caller token | Existing strict/HttpOnly/SameSite cookies, expiry and rotation; stricter input keys/types and full size rejection added |
| api/v1/readings/ | HTTPS POST JSON, verified bearer token, server scope | Fixed RPC URL, structured JSON arguments | 16 KiB cap, explicit allowlist, single-record transaction, active role/assignment, DB numeric checks and successful-write limit |
| common.js / notifications.js | Stored profile / future repository strings | Profile template / notification DOM | Profile encoding; notifications use textContent and dataset, no interpolated HTML |
| Apache static files / uploads | Browser XLSX parsing; CLI importer outside web root | Existing direct import operations | Existing .htaccess denies dotfiles and data extensions; PHP built-in server does not enforce it. No new upload handler introduced |

This is a grouped inventory of existing modules, not proof every rendering sink or deployed query/policy is secure. Supabase calls use structured queries/RPC arguments; new SQL contains no dynamic SQL/string-built queries. Existing `create_manual_reading` SECURITY DEFINER checks identity but its source does not demonstrate full active-account/assignment checks; the new wrapper adds those checks only for its path. Existing manual/Excel access and DB-wide concurrency remain release review items. Schema baseline and live RLS were not supplied or introspected.

## Headers and browser compatibility

`www/php/security-headers.php` is included by session bootstrap (all current top-level PHP pages) and the new API. Enforced CSP restricts frame ancestors, base URI and object embedding. The resource CSP is **report-only**, including script restrictions without unsafe-inline; existing inline scripts, Font Awesome kit, SheetJS CDNs or Google Maps secondary domains may generate console reports. There is no report collector. Do not enforce this resource policy until reviewing network/console traces across auth, maps, charts and Excel flows and replacing inline scripts/adding nonces as needed.

nosniff, strict-origin-when-cross-origin referrer policy and camera/microphone restrictions are set. Geolocation remains allowed for self to preserve maps. HSTS is emitted only when `CPM_HSTS_ENABLED=1` and trusted server HTTPS is on; no includeSubDomains/preload. Static assets, Apache-generated errors and proxy-generated responses need equivalent server headers; avoid duplicate/conflicting CSP policies. TLS/proxy deployment has not been verified.

Session secure-cookie HTTPS detection accepts forwarded protocol **only** with explicit `CPM_TRUST_TLS_PROXY=1`; set this solely behind a proxy that overwrites that header and blocks direct origin access. Prefer server HTTPS=on. Existing installations behind a proxy must configure this before rollout or secure cookies may not be marked Secure. No trust is inferred from arbitrary client headers for the ingestion endpoint.

## Input/output and request security

The API rejects nonobjects, batches, unknown fields, malformed UUIDs, numeric strings/booleans, out-of-bounds measurements and timestamps without offsets. Environmental limits are physical/technical guards, not approved instrumentation ranges. Power fields remain unsupported rather than assuming the prepared schema has been applied. The DB repeats field/type/range/authorization checks so direct RPC callers do not bypass those checks. No service-role key added; client values cannot set threshold, classification or summary data.

History Test Point names/IDs, asset paths, engineer names and display fields now pass through the existing context-appropriate HTML encoder. Profile names/initials are HTML encoded. Notification titles/messages use DOM text and IDs use dataset. These changes have executable payload tests; other HTML templates require continued sink review. No generic database/content double encoding was added.

Session endpoints retain custom-header same-origin POST CSRF checks and do not grant cross-origin CORS. The new API uses bearer authentication only, reads no cookies and grants no CORS. Verify proxy Authorization forwarding. Set PHP display_errors/display_startup_errors Off and log_errors On at server startup; application catches do not suppress PHP startup output. Error responses expose only controlled descriptions and status codes. Audit lines omit tokens, identities, values and raw backend errors; gateway correlation/retention remains owner work.

## Findings and release blockers

| Finding | Severity / status | Action |
| --- | --- | --- |
| xlsx 0.18.5 prototype pollution and ReDoS | High; verified npm audit failure; **no exception/suppression** | Replace through a reviewed supported source/library and prove Node plus browser Excel round trips; npm reports no fixAvailable |
| No staging schema/RLS/integration evidence | Blocking deployment | Owner tests new migration and existing definer grants on isolated staging |
| Manual/Excel duplicate races outside new API locks | Unresolved | Agree a DB-wide locking/uniqueness strategy; test simultaneous writers before claiming global duplicate safety |
| API scope config is local to PHP; old Supabase RPCs remain independently reachable | Unresolved architecture constraint | Review machine identity privileges and gateway/private-schema isolation before external credentials are issued |
| Rate limit covers successful DB batches only | Partial | Configure edge limits for rejected/unauthenticated requests and request/body timeouts |
| Instrument ranges and optional electrical fields | Pending schema/client evidence | Verify constraints/deployed migrations and agree acceptable operating ranges |
| Static/proxy headers, real HTTPS, session cookie behavior and full browser flows | Not run | Apache/HTTPS staging verification required |

Dependency advisories returned by `npm.cmd audit --json`: [prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9). The audit gate intentionally fails at high/critical; do not treat adding CI as resolving these findings.

## Verification

Baseline: 74/74 tests passed. Current results and commands: [test matrix](test-matrix.md). PHP lint passed on all 26 application/test PHP files. Isolated HTTP tests verify API/public-page headers, session CSRF/input restrictions and API status/error redaction; payload tests verify profile/history/notification rendering. YAML parsing/config assertions and JS syntax checks pass. No claim of real Supabase persistence, browser CSP compatibility, penetration testing, secret-scan success or hosted CI success.
