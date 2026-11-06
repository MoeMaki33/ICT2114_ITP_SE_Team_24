# Supabase Auth configuration (#46)

Settings Alex must check or change in the Supabase dashboard (Authentication) for password recovery and verified password change. Nobody else has dashboard access, so this is a checklist for him, not something the app can enforce.

"Reported" values were read from the dashboard by Gabriel on 8 Oct 2026. Dashboard wording and plan limits may differ; items marked **verify** were not checked against Supabase's documentation (web access was unavailable) and should be confirmed in the dashboard or docs.

| # | Setting | Reported 8 Oct | Required | Why |
|---|---------|----------------|----------|-----|
| 1 | Site URL | `http://localhost:3000` | The production app URL (for example the deployed `APP_BASE_URL`) | Used as the default redirect target and in email links. The local app runs at `http://localhost/` under XAMPP, not port 3000. |
| 2 | Redirect URLs (allow-list) | empty | Add the reset page for each environment: production `<APP_BASE_URL>/reset-password.php` and local `http://localhost/reset-password.php` (adjust for sub-folders) | `resetPasswordForEmail` sends `redirectTo`; a URL not on the list is replaced by the Site URL and the recovery link lands on the wrong page. |
| 3 | Secure password change | disabled | On | Extra reauthentication for password changes. The app **always** requires the emailed code itself, so this is defence in depth. Do not rely on it alone: it only asks for reauthentication when the last sign-in is older than 24 h. |
| 4 | Minimum password length | 6 | 8, and no lower than the app's own rule (`js/password-flows.js`, same as Settings) | The app enforces its rule in the browser; the server setting is the real floor. |
| 5 | Custom SMTP | off | On for production | The built-in email service is rate-limited and is intended for testing (**verify** the exact limit and who can receive mail). Recovery and verification emails must reach any user. |
| 6 | Email templates: recovery, reauthentication | default | Check them: recovery must contain the link (`{{ .ConfirmationURL }}`); reauthentication must show the code (`{{ .Token }}`) | The password change flow depends on the reauthentication code reaching the user (**verify** template variable names in the dashboard). |
| 7 | JWT expiry | 3600 s | Decide with the team; consider 900-1800 s | Access tokens already issued stay valid until they expire even after sign-out or a password change elsewhere. A shorter expiry shortens that window but means more refreshes. The PHP guard re-checks the token and profile every 5 minutes (#48). |
| 8 | Public sign-ups | not checked | Disabled (**verify**) | Users are created by admins through the app; open sign-ups would let anyone create an account. The reported "confirm email" option was not visible. |
| 9 | Leaked password protection | not checked | On, if the plan allows (**verify**) | Rejects passwords found in known breaches. |
| 10 | Email rate limits | not checked | Review | Limits how often recovery and code emails can be sent. |

## After changing the settings

1. Tell Gabriel/Bryce; the end-to-end tests in `docs/testing/password-recovery-tests.md` can then be run.
2. Record the final values here and the date they were applied.

## Known limitation to record

Signing out other sessions after a password change revokes their refresh tokens, but access tokens already issued remain valid until they expire. In the app that window is limited by the PHP session re-check (every 5 minutes, #48) and by the JWT expiry above. The tests record what is actually blocked during that window.
