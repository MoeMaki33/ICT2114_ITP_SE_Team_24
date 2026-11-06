# Legacy SQL (ITP 1) — superseded, do not apply

These are the hand-written SQL files from ITP 1. They were run in the Supabase SQL editor (or, for three of them, recorded as migrations) **before** the database was baselined in issue #135.

Their effect is already included in the baseline migration in `supabase/migrations/` (generated with `supabase db pull` from the live project). They are kept here only as history: they explain why parts of the schema look the way they do.

**Do not run these files and do not move them back into `supabase/migrations/`.** Several have migration-style timestamps, so the Supabase CLI would apply them before the baseline and `supabase db reset` would fail. Every new schema change is a new migration in `supabase/migrations/` (see `CLAUDE.md`, "Database rules").

| File | What it did |
|---|---|
| `create_test_point_positions.sql` | Created `test_point_positions` (coordinate modes, GPS + relative X/Y/Z, chainage, one current row per test point) and its `updated_at` trigger |
| `add_test_point_positions_rls.sql` | First RLS policies on `test_point_positions` (read for engineers/admins, write for admins) |
| `create_asset_map_points_view_or_rpc.sql` | First version of the `get_asset_map_points()` RPC for the asset map |
| `create_test_point_equipment_versions.sql` | Created `test_point_equipment_versions`, `test_points.current_equipment_version_id`, indexes and RLS |
| `20260716_06_align_asset_map_position_model.sql` | Sprint 5 correction: position history indexes, writes only through `set_test_point_position()`, `get_test_point_position_history()`, new `get_asset_map_points()` |
| `20260719003532_grant_authenticated_daily_summary_read.sql` | `grant select on daily_summaries to authenticated` (recorded as a remote migration) |
| `20260719004827_scope_available_weeks_to_active_test_points.sql` | `get_weekly_summary_available_weeks()` counts only active test points (recorded as a remote migration) |
| `20260731_01_optimize_active_user_read_policies.sql` | Wraps `current_user_is_active()` in `select` inside four read policies for performance (recorded as a remote migration) |
| `add-test-point-note.sql` | Added `test_points.note` and column comments (was in `sql/`) |

## Remote migration history

The live project's migration history listed the three files marked "recorded as a remote migration" above. When the baseline was created, those versions were marked `reverted` with `supabase migration repair` so that the remote history matches `supabase/migrations/` (baseline only). This changed only the history table, not the schema. The exact versions and the `migration list` output are in the #135 pull request.
