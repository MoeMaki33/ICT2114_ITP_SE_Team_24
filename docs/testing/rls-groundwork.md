# RLS groundwork: BLOCKED

As inspected on 7 October 2026, #135's baseline has not landed on `Sprint-8`.
PR #143 contains preparation and explicitly leaves the baseline to a later PR.
The current checkout has position/asset-map policies but does not include the
complete users/readings/session policies or manual-reading RPC definitions.
No approved non-production test accounts/environment were provided.

Do not infer permissions from frontend controls. `tests/db/rls-matrix.test.js`
is deliberately deferred until the baseline and access matrix land. Then:

1. Compare the reviewed migrations and `docs/security/access-matrix.md`;
   record ambiguous or conflicting expectations for Alex/Gabriel.
2. Use only local/approved staging accounts: admin, active engineer, inactive
   engineer and anonymous. Authenticate with the publishable key; never use a
   service-role client for permission assertions.
3. Gate execution behind `RUN_DB_TESTS=1`. Fail on missing test configuration
   when explicitly enabled; skip clearly by default. Confirm the target is
   non-production before any writes.
4. Cover row visibility, forbidden writes, own/other profile access,
   manual-reading RPCs, internal function denial and deactivation. Seed only
   synthetic fixtures and clean up test-created rows.
5. Record actual allowed/denied results and policy/function references.

This document is groundwork, not executed RLS evidence. No live database was
queried or modified.
