# Fixed protection threshold

The authoritative protection criterion is reading <= -850 mV. Warning remains
an unprotected display state for -850 < reading <= -800; missing readings
remain Unknown/No Data. The detail controller previously used a binary display
and keeps that behavior. Historical snapshot columns are preserved for audit.

## Inspection before changes

| Location | Threshold reads/writes and classification |
| --- | --- |
| `www/testpoints.php`, `www/js/testpoints.js` | Editable add/edit threshold; required custom import threshold; payload writes; list/export display; weekly status from repository |
| `www/js/testpoint-update.js` | Stored point threshold; fallback edit snapshot/protected flag; manual create/update RPC calls |
| `www/js/testpoint-view.js` | Point and reading snapshot thresholds; raw is_protected flags; reading/group/hero classification; chart boundary |
| `www/js/services/status.js` | Shared classification accepted a threshold override; Warning through -800 |
| `www/js/repositories/supabase-repositories.js` | Point, reading snapshot, weekly RPC and operational models; shared classification; weekly RPC status override |
| `www/js/asset-map-repository.js`, `asset-map.js` | SQL threshold/status mapping and popup display |
| `www/js/chart-protection-presentation.js` | Custom/mixed chart thresholds, point/segment colors, zones and labels |
| `www/js/history.js` | Historical snapshots and shared status; chart reference |
| `www/js/weekly.js`, `weekly-daily-trend.js` | Chart reference and axis bounds; repository status consumed by weekly aggregation |
| `www/js/dashboard.js`, `dashboard-weekly-model.js` | Chart reference and bounds; repository status consumed by dashboard aggregation |
| Legacy importer (formerly `www/scripts/import-jalanban.js`) | Loaded point threshold and wrote reading snapshots |
| `supabase/migrations/create_asset_map_points_view_or_rpc.sql`, `20260716_06_align_asset_map_position_model.sql` | Asset-map RPC used stored test-point threshold for protection |
| `supabase/seeds/weekly_summary_demo_seed.sql` | Synthetic -850 points/readings; demo status uses point threshold |
| `supabase/data/weekly_summary_cleanup.sql`, `supabase/queries/weekly_summary_data_quality_audit.sql` | Existing fixed-value cleanup and diagnostic threshold selection |
| Existing tests | Custom chart thresholds were explicitly expected; updated to fixed rule |

The schema allows custom values through the current UI/importer. No production
records were inspected, so the number of stale values is unknown. Definitions
of manual-reading and summary-refresh functions are absent until #135 lands.

## Implementation

The shared status service ignores overrides. Add/import use its fixed constant;
edit payloads omit threshold_mv (including import updates). Generated templates
omit the column. Legacy templates may contain it, but it is ignored. Exports
and active point models report -850. Reading models retain historical snapshot
values while classification ignores them. Raw detail and asset-map statuses are
derived from the reading instead of trusting stale flags. Chart zones always
use -850. No unrelated dashboard/history refactor was needed.

## Migration required — prepared, NOT APPLIED

`supabase/migrations/20261007000000_fix_protection_threshold.sql` normalizes
test-point thresholds, sets a default/check constraint, forces fixed thresholds
for new point/reading writes, recalculates protection flags, preserves historical
snapshots on unrelated edits, and replaces the known asset-map RPC without
changing its return contract. Reading-value edits receive a new -850 snapshot.

Alex must review this after #135 lands, check trigger ordering and actual RPC
contracts, and test locally/staging before any live application. In particular,
audit create_manual_reading, update_manual_reading, daily/weekly refresh,
backfill and summary RPC functions for stored-threshold/snapshot/status usage.
Triggers enforce new rows, but SQL functions that independently classify from
old snapshots must also be updated in a reviewed follow-up migration. Rebuild
derived summary counts, percentages, crossings and statuses after normalization
using the reviewed refresh functions. Their signatures are not available here,
so no guessed refresh calls or function replacements are included.

Suggested read-only checks for Alex in the approved test environment:

```sql
select threshold_mv, count(*) from public.test_points group by threshold_mv;
select proname, pg_get_functiondef(oid)
from pg_proc
where pronamespace = 'public'::regnamespace and prokind = 'f'
  and pg_get_functiondef(oid) ~ 'threshold_mv|is_protected';
```

Migration execution, RPC/database enforcement and summary rebuild are NOT RUN
and blocked by the missing baseline/environment. No live migration or data
change was made. Automated validation is recorded in `sprint-8-validation.md`.

Rollback: before applying, Alex must back up the original point thresholds,
reading protection flags and function/trigger definitions. Revert application
code if needed, and restore the prior database definitions/data from that
backup under Alex's review. The migration cannot reconstruct overwritten
point thresholds, so an automatic guessed down-migration is not provided.
