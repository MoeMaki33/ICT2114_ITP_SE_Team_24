# SheetJS dependency audit remediation

The original Week 9 audit found prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9) in the npm registry release `xlsx@0.18.5`. Its “No fix available” message refers to the old npm distribution; it does not mean the vendor has no patched version.

Updated Node dependencies to the exact official SheetJS 0.20.3 tarball URL and regenerated the npm lockfile, including its integrity hash. Updated both PHP page script tags and the SPA dependency loader to the official 0.20.3 browser bundle. Added the CDN to the report-only CSP script sources. Existing SheetJS APIs and import/export modules remain in place; no audit suppression or threshold change.

Official sources: [Node installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [browser installation](https://docs.sheetjs.com/docs/getting-started/installation/standalone/), [ReDoS advisory](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9). The advisory identifies versions before 0.20.2 as affected by ReDoS; 0.20.3 is above both reported fix boundaries. Monitor vendor releases as well as npm/Dependabot: an externally hosted tarball is not necessarily covered by registry update automation or vulnerability matching.

Verification commands:

```powershell
npm.cmd ci
npm.cmd audit --audit-level=high
node --test tests/spreadsheet-compatibility.test.js
npm.cmd test
```

Verified locally: clean `npm ci` succeeds; `npm audit --audit-level=high` exits 0 with zero reported vulnerabilities; all 82 tests pass with zero failures/skips, including all three new spreadsheet tests. Changed PHP files pass lint; navigation JavaScript passes syntax checking; `git diff --check` passes.

The new compatibility tests cover version consistency across all entry points, binary XLSX round trips, and interoperation between the Node module and actual standalone browser bundle in an isolated JavaScript context. Fixtures contain fictional Test Point names, timestamps, negative potentials, zeroes, decimals, blank cells and Unicode. No customer workbook or database is used.

This supersedes the earlier XLSX release blocker in the Week 9 security review/summary/test matrix. Full browser UI UAT and hosted CI still require separate verification. The install and browser now require access to `cdn.sheetjs.com`; the npm lockfile verifies the tarball integrity. Keep the blocking dependency-audit job enabled.
