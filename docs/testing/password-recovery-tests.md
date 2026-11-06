# Password recovery and verified password change tests (#46)

Run after the Supabase Auth settings in `docs/security/auth-configuration.md` are applied.
Record: date, tester, environment (local / production), result (Pass / Fail / Not run), notes.

## Recovery

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| R1 | Request recovery for an existing account | Neutral message; email arrives | | |
| R2 | Request recovery for an unknown email | Same neutral message; no email; nothing revealed | | |
| R3 | Open a valid recovery link | Reset form shown | | |
| R4 | Open an expired link | Clear message and a link back to forgot-password | | |
| R5 | Open an invalid or tampered link | Clear message and a link back | | |
| R6 | Reuse a link already used | Rejected with a clear message | | |
| R7 | New password breaks the rules / confirmation mismatch | Error shown; no change | | |
| R8 | Successful reset | Signed out everywhere; redirected to `index.php?reset=1` with notice; login with the new password works; old password fails | | |
| R9 | Resend cooldown | Button disabled for 60 s | | |

## Verified password change (Settings)

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| C1 | Fresh session (just signed in) | Emailed code is required before the change | | |
| C2 | Session older than 24 h (or simulated) | Emailed code is required before the change | | |
| C3 | Wrong code | Rejected; password unchanged | | |
| C4 | Expired or reused code | Rejected; password unchanged | | |
| C5 | Correct code and valid new password | Password changed; success message | | |
| C6 | Other sessions after C5 | Refresh tokens revoked; other browser signed out at its next refresh | | |
| C7 | Other session's access token window (up to JWT expiry) | Record what still works and what the PHP re-check blocks | | |

## Settings checked at test time

Site URL, redirect allow-list, Secure password change, minimum length, SMTP, JWT expiry (copy from `auth-configuration.md`): ______
