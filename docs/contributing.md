# Contributing

Read `CLAUDE.md`, `docs/IMPLEMENTATION_PLAN.md` and the current sprint plan first.

```text
main
└── development
    └── Sprint-N
        └── sprint-N-<issue>-<owner>-<short-name>
```

Branch from the current integration branch, work on a personal issue branch,
and open a PR back into that Sprint branch. Never push feature work directly
to `main`, `development` or `Sprint-N`. Alex integrates the sprint into
`development` and handles releases to `main`.

```sh
git fetch origin
git switch -c sprint-8-136-owen-ci-security origin/Sprint-8
npm ci
npm test
```

Keep the issue branch current by merging or rebasing the latest Sprint branch.
Review conflicts manually, preserve teammates' changes, and rerun checks.
Before pushing, run all tests and lint every PHP file (`php -l`). Include actual
test results, anything NOT RUN or BLOCKED, screenshots for UI changes, and
migration details in the PR. Reference `Part of #<issue>` until all requirements
are met; use `Closes` only when the issue is complete.

Never commit `.env`, service-role keys, credentials, client spreadsheets or
exports. Store private local data in root `data/`, outside `www/`; use synthetic
fixtures for tests. Copy root `.env.example` to root `.env` for the legacy CLI
importer. Do not run that importer against production during validation.
Only Alex reviews and applies live Supabase migrations.

## Branch protection for Alex to apply

Protect `main`, `development` and the active Sprint branch:

- Require a pull request and at least one approving review.
- Dismiss stale approvals and require resolved review conversations.
- Require `Tests and PHP lint` and `Gitleaks` once these checks have run on a PR.
- Require branches to be current before merging.
- Block force pushes and deletion; enforce protections for administrators where
  the repository's plan supports this.
- Limit direct pushes to the integration/release maintainer where supported.

The dependency audit is report-only for Sprint 8. It is not a separate required
status check. Administrative protection changes are Alex's responsibility;
adding this document does not mean they have been applied.

## CI and web server

CI runs on PRs into `Sprint-*`, `development` and `main`, and can be run manually.
Gitleaks scans full Git history; do not suppress genuine historical findings.
The [Gitleaks action documentation](https://github.com/gitleaks/gitleaks-action)
describes the action and its permissions. Comments are disabled, and the
workflow token has read-only repository access.

`.gitleaks.toml` keeps the default detection rules and allows only values with
the Supabase publishable-key prefix, which are
[public by design](https://supabase.com/docs/guides/getting-started/api-keys).
Secret keys and service-role JWTs are not allowlisted.

Apache must use `www/` as DocumentRoot with `mod_rewrite` and
`AllowOverride Options FileInfo AuthConfig` (or `All`) enabled. Verify dotfiles,
SQL/spreadsheets and scripts/data/node_modules paths return 403 or 404. The PHP
built-in server (`npm run serve`) does **not** enforce `.htaccess`; use Apache
to validate access restrictions. Keep private files outside the web root on
every server regardless of access rules.
