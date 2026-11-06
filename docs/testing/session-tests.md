# Session hardening tests (#48)

Tested locally on XAMPP (Apache 2.4.58, PHP 8.2.12), Firefox, 8 Oct 2026.
Branch: `sprint-8-048-gabriel-php-sessions`. Policy: D-SESS-1 (SPRINT_08 section 3.2).

Short timeouts were set temporarily in `www/php/session-bootstrap.php` for the
expiry tests (idle 60 s, absolute 120 s) and restored to 30 min / 12 h / 14 days
before commit.

## Results

| # | Test | Remember Me | Expected | Result |
|---|------|-------------|----------|--------|
| 1 | Login | off | Reaches dashboard; `CPMSESSID` is HttpOnly, SameSite=Lax, Expires "Session" | Pass |
| 2 | Logout | off | Login page; logged-in session destroyed (ID changes, anonymous cookie only); `/dashboard.php` redirects to login | Pass |
| 3 | Login | on | `CPMSESSID` expires about 14 days out; session ID rotated at login | Pass |
| 4 | GET `php/set-session.php` | n/a | 405 | Pass |
| 5 | POST without `X-CPM-Request` header | n/a | 403 | Pass |
| 6 | POST with header but foreign `Origin` | n/a | 403 | Pass |
| 7 | POST with header, empty body | n/a | 400, no call to Supabase | Pass |
| 8 | Idle expiry (60 s test value), full reload (F5) | off | `index.php?expired=1` with notice | Pass |
| 9 | Idle expiry, menu click (page-swap navigation) | off | `index.php?expired=1` with notice | Pass (after fix, see below) |
| 10 | Absolute expiry (120 s test value), user active | off | Expired despite activity | Pass |
| 11 | Idle expiry (60 s test value), menu click | on | Expired notice; after browser restart login page shown | Pass |
| 12 | Cross-tab sign-out | on | Other tab ends on `index.php?expired=1` | Pass |
| 13 | Deactivated user ends within about 5 min | any | Session ended on next guard re-check / token refresh | Not yet tested |
| 14 | Supabase token refresh syncs to PHP session | any | `TOKEN_REFRESHED` posts `refresh`; stored token updated; idle time not extended | Not yet tested (needs a tab open over 1 h) |
| 15 | Absolute limit with Remember Me on (14 days) | on | Expired at 14 days | Not tested; same code path as 10 with a different constant |

## Bug found and fixed during testing

Test 9 initially failed: after an idle expiry, clicking a menu link landed on the
login page without the notice. `js/navigation-controller.js` loads pages with
`fetch()`, followed the server redirect silently, got the login page HTML,
failed to find page content and retried the original URL, by which time the
session was already gone. Fix: when `response.redirected` is true, navigate to
`response.url` so the redirect target and its query string are kept.

## Known limitations and follow-ups

- **Remember Me vs 30 min idle:** with a 30 min idle limit, Remember Me only
  preserves the session across a browser restart within 30 min. Needs a team
  decision (Gabriel / Bryce / Alex) before the policy is final.
- Every request, including rejected ones, creates an anonymous `CPMSESSID`;
  lazy session start would avoid empty session files.
- `X-Powered-By: PHP/8.2.12` is exposed; turn off `expose_php` in deployment config.
- Session files use the default `session.save_path`; a private path is a deployment follow-up.
- Session constants live in `php/session-bootstrap.php` until #135 provides a central settings file.
- On HTTPS, the `Secure` cookie flag is set automatically (not testable on plain http://localhost).
