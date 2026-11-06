<?php
/**
 * Shared server-side Supabase config.
 * Mirrors js/config/supabase-config.js — only the publishable/anon key is used
 * here, so there is no service-role secret to protect. PHP calls Supabase with
 * the user's own access token, exactly like the browser client does, and relies
 * on the same Row Level Security policies.
 *
 * Environment variables (e.g. Apache SetEnv) override the fallbacks, which
 * must stay equal to js/config/supabase-config.js (tests/app-config.test.js).
 */

define('SUPABASE_URL', getenv('SUPABASE_URL') ?: 'https://pscwapylbjvulvsszdur.supabase.co');
define('SUPABASE_PUBLISHABLE_KEY', getenv('SUPABASE_PUBLISHABLE_KEY') ?: 'sb_publishable_7UxNtTTNoHw27HfglZDy1w_2Q9hJTMV');
