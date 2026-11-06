# Branch protection and automated checks

Status: **pending manual owner/admin action** (repository admin: Alex). Repository-wide settings have not been read or changed. Updated 29 Oct 2026: CI push trigger and Dependabot now target `development` (were the personal `sprint-9-owen` branch); the XLSX audit finding is resolved (`npm audit`: 0 vulnerabilities), so all three checks are expected to pass.

The workflow is `CI`, with these exact job/check names:

| Job ID | Check name | Behavior |
| --- | --- | --- |
| validation | Tests and PHP lint | npm ci; Node tests including PHP API/validator tests; JS syntax and PHP lint |
| dependency-audit | Dependency audit | npm ci; npm audit --audit-level=high; passes since the SheetJS 0.20.3 upgrade |
| secrets | Gitleaks | Full history, read-only permissions, no PR comments; Gitleaks 8.30.1 |

All action references use immutable commits. Pins were resolved against official [checkout](https://github.com/actions/checkout/commit/d23441a48e516b6c34aea4fa41551a30e30af803), [setup-node](https://github.com/actions/setup-node/commit/249970729cb0ef3589644e2896645e5dc5ba9c38) and [Gitleaks](https://github.com/gitleaks/gitleaks-action/commit/e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e) sources. Dependabot proposes npm/action updates against the permitted branch only; it does not merge them. npm cache holds dependency downloads and npm ci honors the lockfile. No production secrets are needed for tests. PHP must exist in CI or the API test file fails instead of silently skipping.

The workflow runs on pushes to `development`, `main` and `sprint-*` branches, PRs into the existing integration/default branch patterns plus `sprint-*`, and manual dispatch. No hosted run has been triggered/verified by this work. The Gitleaks binary is version-pinned by the existing action; upstream download integrity and organization license requirements should be checked by the owner on first hosted execution.

## Owner setup steps

1. In GitHub repository **Settings → Rules → Rulesets**, create an active branch ruleset for the repository's **actual default branch** (inspect the default; do not assume a name). Alternatively use Settings → Branches → Add branch protection rule for that exact branch.
2. Require pull requests before merging and at least one independent approving review. Dismiss stale reviews, require approval of the most recent push and resolved review conversations. Add code-owner review if ownership is configured.
3. Require the three check names above after they have appeared in a trusted CI run; select the GitHub Actions source app when available. Require the branch to be current before merging, or use a configured merge queue.
4. Block force pushes and deletions. Restrict direct pushes and bypass to the approved maintainers/break-glass role; prevent routine administrator bypass where supported. Do not grant the agent a bypass role.
5. Save/activate the rule. Verify on a disposable owner-controlled test PR that missing/failing checks and absent approval prevent merging. Confirm force pushes/deletion are denied by the rule UI; do not attempt destructive verification on real branches.
6. Record rule ID, target branch, active status, selected checks, bypass actors, timestamp and reviewer evidence here after the owner completes verification.

No bypass or temporary audit exception is proposed. The earlier XLSX finding is resolved, so no exception is needed. Do not require an invented check name, suppress the audit or claim protection is enabled based on this file. If protection would block current release work, the owner must resolve the finding or explicitly record a scoped, justified, expiring exception; none is authorized here.
