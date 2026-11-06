# Week 9 implementation plan — 24 October 2026

Branch checked before edits: `sprint-9-owen`; initial tree clean. User branch restrictions override older branching/PR instructions in CLAUDE.md. No other branch, PR, deployment or administrative setting is changed.

| Order | Existing behavior | Planned files/change | Principal risk |
| --- | --- | --- | --- |
| Baseline | Node test suite; PHP/XAMPP available outside PATH | Record baseline before changes | Existing tests mostly use pure logic/source assertions |
| Ingestion | `create_manual_reading` creates batches/readings; one-minute duplicate check; SQL summary functions | PHP validator, `api/v1/readings/index.php`, transactional `ingest_reading_v1` migration/rollback; API documentation | No complete schema baseline or verified staging deployment; existing definer permissions need review |
| Security | Session gate, token/profile revalidation, custom-header same-origin POST protection; several HTML template sinks | Shared headers, session size/type checks, explicit proxy trust, profile/history encoding, notification DOM rendering | CSP must preserve inline scripts/CDNs/maps; report-only resource policy until browser checks |
| Quality | npm lockfile; Tests and PHP lint / Gitleaks workflow; report-only audit | Immutable action pins, branch trigger, blocking audit, Dependabot | Known vulnerable XLSX library; hosted checks not executed locally |
| Verification | 74 passing baseline tests | PHP validator, HTTP stub API tests, rendering tests; test matrix | Mock transport cannot establish real RLS, transactions, summaries or concurrent behavior |
| Decisions | Notification repository returns empty data; feature flag false | Client questions, event mapping, draft message and blocked backlog | No client approval; no notifications enabled or sent |

Use a single-record endpoint to avoid any possibility of partially committed batches. Reuse existing SQL write/classification/summary logic without rewriting the Excel paths. Keep deployment disabled by default. Do not run SQL against live data. Record uncovered acceptance criteria explicitly.
