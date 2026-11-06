<?php
/**
 * Server-side provisional settings (docs/IMPLEMENTATION_PLAN.md §3).
 * Browser-side values live in www/js/config/app-settings.js.
 *
 * D-SESS-1 session policy (team decision, docs/sprints/SPRINT_08.md §3.2),
 * used by the session hardening in #48 (session-bootstrap.php, require_login()).
 */

const APP_SETTINGS = [
  'session' => [
    'idle_timeout_seconds' => 1800,                    // 30 min, Remember Me on or off
    'absolute_timeout_seconds' => 43200,               // 12 h without Remember Me
    'remember_me_absolute_timeout_seconds' => 1209600, // 14 days with Remember Me
    'id_regeneration_interval_seconds' => 900,         // rotate the session ID every 15 min
    'revalidation_interval_seconds' => 300,            // re-check token + role/is_active every 5 min
  ],
  // Readings API v1 (docs/week9/readings-api.md). Nobody reviews an API reading before
  // it is stored, so values the Excel import only warns about are rejected here.
  // PROVISIONAL plausibility limits until the client confirms instrument ranges;
  // keep equal to ingest_reading_v1 (supabase/migrations/20261029090000_*.sql).
  'ingestion' => [
    'max_future_seconds' => 300,                       // clock skew allowance
    'earliest_reading_ts' => '2000-01-01T00:00:00Z',   // import warns on older times
    'ranges' => [
      'value_mv'            => [-5000, 5000],          // import warns below -5000 mV
      'temperature_c'       => [-50, 150],             // import "usual operating range"
      'medium_conductivity' => [0, 1000000],           // µS/cm, no confirmed ceiling
      'ph'                  => [0, 14],
      'dissolved_oxygen'    => [0, 25],                // mg/L, import "usual range"
      'current_a'           => [0, 300],               // reading_batches_current_a_range (#134)
      'voltage_v'           => [0, 200],               // reading_batches_voltage_v_range (#134)
    ],
    // Rectifier outputs (D-MEAS-1) exist only on impressed-current (variable) points.
    'electrical_fields' => ['current_a', 'voltage_v'],
  ],
  // GET /api/v1/readings/ paging (client confirmed paging, 4 Nov): largest and default
  // `limit`; further pages via `offset` and the Link rel="next" header.
  'retrieval' => [
    'max_page_size' => 1000,
  ],
];
