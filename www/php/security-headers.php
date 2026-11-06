<?php
// Shared by pages and JSON endpoints. Tighten CSP after staging compatibility review.
function cpm_security_headers() {
  header('X-Content-Type-Options: nosniff');
  header('Referrer-Policy: strict-origin-when-cross-origin');
  header('Permissions-Policy: camera=(), microphone=(), geolocation=(self)');
  header("Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  header("Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdn.sheetjs.com https://cdnjs.cloudflare.com https://maps.googleapis.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://maps.googleapis.com; img-src 'self' data: https://*.googleapis.com https://*.gstatic.com");
  // Enable only after the owner verifies HTTPS for the entire deployment.
  if (getenv('CPM_HSTS_ENABLED') === '1' && !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    header('Strict-Transport-Security: max-age=31536000');
  }
}
cpm_security_headers();
