<?php
// GET-only alias of /api/v1/readings/ for the client's illustrative "GET /api/readings"
// (www/.htaccess rewrites /api/readings and /api/readings/ here). Same handler, validation,
// authorisation and response contract; any other method gets 405 with "Allow: GET".
// A file, not a directory, so Apache's DirectorySlash never redirects the request.
const CPM_READINGS_GET_ONLY = true;
require __DIR__ . '/v1/readings/index.php';
