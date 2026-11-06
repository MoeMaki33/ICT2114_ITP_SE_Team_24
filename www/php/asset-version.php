<?php
/**
 * Cache-busting helper for local <script>/<link> tags.
 *
 * Before this, every page hardcoded a manual "?v=DATE-TIME" string on each
 * script/style tag, and it only worked if someone remembered to bump it by
 * hand whenever the file changed. Forgetting (easy to do) meant browsers
 * kept serving a stale cached copy of the file after an edit.
 *
 * asset_v() replaces that with the file's actual last-modified time, so the
 * URL — and therefore the browser's cache key — changes automatically the
 * moment the file is saved. No manual version bumping required.
 *
 * Usage: <script src="<?php echo asset_v('js/testpoints.js'); ?>"></script>
 */

function asset_v($relativePath) {
  $fullPath = __DIR__ . '/../' . ltrim($relativePath, '/');
  $mtime = @filemtime($fullPath);
  return $relativePath . ($mtime ? '?v=' . $mtime : '');
}
