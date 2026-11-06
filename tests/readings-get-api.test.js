// GET /api/v1/readings/ (client retrieval contract, docs/week9/readings-api.md) against the
// real PHP endpoint and an isolated Supabase stub. Synthetic fixtures only; no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const php = process.env.PHP_BINARY || (process.platform === 'win32' && fs.existsSync('C:/xampp/php/php.exe') ? 'C:/xampp/php/php.exe' : 'php');
const available = !spawnSync(php, ['--version']).error;
const root = path.resolve(__dirname, '..');
if (process.env.CI && !available) throw new Error('PHP is required in CI; API tests must not silently skip');

test('PHP read query validator: timestamps, filters, injection and UTC output', { skip: !available }, () => {
  const result = spawnSync(php, ['tests/php/read-query-validation.php'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\d+ PHP read query cases passed/);
});

const TP1 = '00000000-0000-4000-8000-000000000001';
const TP2 = '00000000-0000-4000-8000-000000000002';
const TS = '2026-11-02T10:00:00Z';
// PostgREST-shaped rows: test_point_readings with the embedded reading_batches row.
const fixtures = [
  { id: 'a0000000-0000-4000-8000-000000000002', test_point_id: TP2, value_mv: -900,
    reading_batches: { reading_ts: '2026-11-02T10:00:00+00:00', voltage_v: null, current_a: null } },
  { id: 'a0000000-0000-4000-8000-000000000001', test_point_id: TP1, value_mv: -850,
    reading_batches: { reading_ts: '2026-11-02T10:00:00+00:00', voltage_v: 12.5, current_a: 3.25 } },
  { id: 'a0000000-0000-4000-8000-000000000003', test_point_id: TP1, value_mv: -860,
    reading_batches: { reading_ts: '2026-11-02T11:00:00+00:00', voltage_v: 12, current_a: 3 } },
];

test('HTTP GET retrieval with isolated Supabase stub', { skip: !available }, async (t) => {
  const seen = [];
  let override = null;   // per-case replacement answer for the readings query
  const backend = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, apikey: req.headers.apikey, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://stub');
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const users = { 'valid-token': 'reader', 'inactive-token': 'inactive', 'norole-token': 'norole' };
    if (url.pathname === '/auth/v1/user') {
      if (!users[token]) { res.writeHead(401); res.end('{}'); return; }
      res.end(JSON.stringify({ id: users[token] })); return;
    }
    if (url.pathname === '/rest/v1/users') {
      const profiles = { reader: { role: 'corrosion_engineer', is_active: true }, inactive: { role: 'corrosion_engineer', is_active: false }, norole: { role: null, is_active: true } };
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      res.end(JSON.stringify(profiles[id] ? [profiles[id]] : [])); return;
    }
    if (url.pathname === '/rest/v1/test_point_readings') {
      if (override) { res.writeHead(override.status); res.end(JSON.stringify(override.body)); return; }
      // Apply the same filters PostgREST would, so filter tests exercise the real query string.
      const want = Date.parse(url.searchParams.get('reading_batches.reading_ts').replace(/^eq\./, ''));
      const point = url.searchParams.get('test_point_id');
      const column = [...url.searchParams.keys()].find((key) => key.startsWith('reading_batches.') && url.searchParams.get(key) === 'not.is.null');
      const rows = fixtures
        .filter((row) => Date.parse(row.reading_batches.reading_ts) === want)
        .filter((row) => !point || `eq.${row.test_point_id}` === point)
        .filter((row) => !column || row.reading_batches[column.slice('reading_batches.'.length)] !== null)
        .sort((a, b) => a.test_point_id.localeCompare(b.test_point_id) || a.id.localeCompare(b.id));
      const offset = Number(url.searchParams.get('offset') || 0);
      res.end(JSON.stringify(rows.slice(offset, offset + Number(url.searchParams.get('limit'))))); return;
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => backend.close(resolve)));
  const reservation = http.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  // Ingestion stays disabled: retrieval has its own flag.
  const server = spawn(php, ['-d', 'display_errors=0', '-d', 'display_startup_errors=0', '-S', `127.0.0.1:${port}`, 'tests/php/api-router.php'], {
    cwd: root, stdio: 'ignore', env: { ...process.env,
      SUPABASE_URL: `http://127.0.0.1:${backend.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'fictional-publishable-key',
      CPM_INGESTION_ENABLED: '0', CPM_READINGS_READ_ENABLED: '1' }
  });
  t.after(() => { server.kill(); });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await fetch(`${base}/api/v1/readings/`); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  assert.ok(ready, 'PHP test server starts');
  // routerPath: the test router's /insecure and /read-disabled stand in for the endpoint.
  const get = (query, token = 'valid-token', routerPath = '/api/v1/readings/') => fetch(`${base}${routerPath}${query}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const exactBadTimestamp = '{"message":"Invalid or missing timestamp"}';
  const P = '&field=potential';   // field is required (client, 4 Nov)

  // 1, 2, 6: valid timestamp, no optional testPointId; both matches returned in a fixed order.
  let response = await get(`?timestamp=${TS}${P}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f]{16}$/);
  const all = await response.json();
  assert.ok(Array.isArray(all));
  assert.deepEqual(all, [
    { timestamp: TS, value: -850, testPointId: TP1, field: 'potential', unit: 'mV' },
    { timestamp: TS, value: -900, testPointId: TP2, field: 'potential', unit: 'mV' },
  ]);
  for (const item of all) { assert.equal(typeof item.timestamp, 'string'); assert.equal(typeof item.value, 'number'); }
  assert.equal(response.headers.get('link'), null, 'single page: no next link');
  assert.deepEqual(await (await get(`?timestamp=${TS}${P}`)).json(), all, 'repeat request gives the same order');
  // The same instant expressed with an offset (encoded, and unencoded "+" that decodes to a space).
  assert.deepEqual(await (await get(`?timestamp=${encodeURIComponent('2026-11-02T18:00:00+08:00')}${P}`)).json(), all);
  assert.deepEqual(await (await get(`?timestamp=2026-11-02T18:00:00+08:00${P}`)).json(), all);

  // 3, 12: optional testPointId and the field selector; decimals stay numeric and exact.
  assert.deepEqual(await (await get(`?timestamp=${TS}&testPointId=${TP2}${P}`)).json(),
    [{ timestamp: TS, value: -900, testPointId: TP2, field: 'potential', unit: 'mV' }]);
  assert.deepEqual(await (await get(`?timestamp=${TS}&testPointId=${TP2.toUpperCase()}${P}`)).json(),
    [{ timestamp: TS, value: -900, testPointId: TP2, field: 'potential', unit: 'mV' }], 'upper-case id accepted');
  response = await get(`?timestamp=${TS}&field=voltage`);
  const voltageText = await response.text();
  assert.match(voltageText, /"value":12\.5[,}]/);
  assert.deepEqual(JSON.parse(voltageText), [{ timestamp: TS, value: 12.5, testPointId: TP1, field: 'voltage', unit: 'V' }],
    'TP2 has no voltage recorded, so it is absent rather than zero');
  assert.deepEqual(await (await get(`?timestamp=${TS}&testPointId=${TP1}&field=current`)).json(),
    [{ timestamp: TS, value: 3.25, testPointId: TP1, field: 'current', unit: 'A' }]);
  assert.deepEqual(await (await get(`?timestamp=${TS}&testPointId=${TP2}&field=voltage`)).json(), []);
  const lastQuery = seen.filter((r) => r.url.startsWith('/rest/v1/test_point_readings')).pop().url;
  assert.match(lastQuery, /select=id,test_point_id,value_mv,reading_batches!inner\(reading_ts,voltage_v\)/);
  assert.match(lastQuery, /reading_batches\.reading_ts=eq\.2026-11-02T10%3A00%3A00\.000000Z/);
  assert.match(lastQuery, /order=test_point_id\.asc,id\.asc&limit=1001&offset=0$/);

  // Paging (client confirmed, 4 Nov): limit/offset, array body, Link rel="next" only when more rows exist.
  response = await get(`?timestamp=${TS}${P}&limit=1`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [all[0]]);
  const next = response.headers.get('link');
  assert.equal(next, '</api/v1/readings/?timestamp=2026-11-02T10%3A00%3A00.000000Z&field=potential&limit=1&offset=1>; rel="next"');
  response = await fetch(`${base}${next.slice(1, next.indexOf('>'))}`, { headers: { Authorization: 'Bearer valid-token' } });
  assert.deepEqual(await response.json(), [all[1]], 'following Link gives the second page');
  assert.equal(response.headers.get('link'), null, 'last page has no next link');
  response = await get(`?timestamp=${TS}&testPointId=${TP1}${P}&limit=1`);
  assert.equal(response.headers.get('link'), null, 'exactly limit rows and nothing more: no next link');
  response = await get(`?timestamp=${TS}${P}&offset=2`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '[]', 'past the end is an empty page');
  assert.match(seen.filter((r) => r.url.startsWith('/rest/v1/test_point_readings')).pop().url, /&limit=1001&offset=2$/);
  // Pages concatenate to the single-page result: nothing lost or repeated.
  const paged = [];
  for (let offset = 0; offset < 4; offset++) paged.push(...await (await get(`?timestamp=${TS}${P}&limit=1&offset=${offset}`)).json());
  assert.deepEqual(paged, all);

  // 7: valid timestamp with no stored reading.
  response = await get(`?timestamp=2026-11-02T10:00:01Z${P}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '[]');

  // 4, 5: missing / invalid timestamps give the exact client body.
  const dataQueriesBefore = seen.filter((r) => r.url.startsWith('/rest/v1/test_point_readings')).length;
  for (const query of ['', `?testPointId=${TP1}`, '?timestamp=', '?timestamp=not-a-date', '?timestamp=2026-02-30T10:00:00Z',
    '?timestamp=2026-11-02T10:00:00', '?timestamp=2026-11-02T10:00:00%2B15:00', '?timestamp=2026-11-02T25:00:00Z',
    '?timestamp[]=2026-11-02T10:00:00Z', `?timestamp=${encodeURIComponent("2026-11-02T10:00:00Z' OR 1=1--")}`]) {
    response = await get(query);
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(await response.text(), exactBadTimestamp, query);
  }
  // 8: missing field, invalid filters and invalid paging are rejected before any data query.
  for (const [query, message] of [
    [`?timestamp=${TS}`, 'Invalid or missing field'],
    [`?timestamp=${TS}&testPointId=${TP1}`, 'Invalid or missing field'],
    [`?timestamp=${TS}&field=`, 'Invalid or missing field'],
    [`?timestamp=${TS}&field=value_mv`, 'Invalid or missing field'],
    [`?timestamp=${TS}&field=password`, 'Invalid or missing field'],
    [`?timestamp=${TS}&testPointId=TP-001${P}`, 'Invalid testPointId'],
    [`?timestamp=${TS}&testPointId=${encodeURIComponent("' OR 1=1--")}${P}`, 'Invalid testPointId'],
    [`?timestamp=${TS}&testPointId=${encodeURIComponent(`${TP1}&select=*`)}${P}`, 'Invalid testPointId'],
    [`?timestamp=${TS}${P}&select=*`, 'Unexpected query parameter'],
    [`?timestamp=${TS}${P}&limit=0`, 'Invalid limit (1 to 1000)'],
    [`?timestamp=${TS}${P}&limit=1001`, 'Invalid limit (1 to 1000)'],
    [`?timestamp=${TS}${P}&offset=-1`, 'Invalid offset'],
    [`?timestamp=${TS}${P}&offset=${encodeURIComponent('1&limit=5')}`, 'Invalid offset'],
  ]) {
    response = await get(query);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { message }, query);
  }
  assert.equal(seen.filter((r) => r.url.startsWith('/rest/v1/test_point_readings')).length, dataQueriesBefore, 'invalid input never queries readings');

  // 9: authentication, account status, transport and feature flag.
  for (const [token, status, message] of [['', 401, 'Invalid or missing token'], ['bad-token', 401, 'Invalid or missing token'],
    ['inactive-token', 403, 'Read denied'], ['norole-token', 403, 'Read denied']]) {
    response = await get(`?timestamp=${TS}${P}`, token);
    assert.equal(response.status, status, token);
    assert.deepEqual(await response.json(), { message }, token);
  }
  response = await get(`?timestamp=${TS}${P}`, 'valid-token', '/insecure');
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { message: 'HTTPS required' });
  response = await get(`?timestamp=${TS}${P}`, 'valid-token', '/read-disabled');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: 'Readings retrieval is disabled' });

  // Database failures never leak details; a full default page is paged, not refused or truncated.
  override = { status: 400, body: { code: '42P01', message: 'PRIVATE DB DETAILS', hint: 'relation secret' } };
  response = await get(`?timestamp=${TS}${P}`);
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /PRIVATE|secret|42P01/);
  override = { status: 503, body: { message: 'PRIVATE DB DETAILS' } };
  response = await get(`?timestamp=${TS}${P}`);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /PRIVATE/);
  override = { status: 401, body: { message: 'JWT expired' } };
  assert.equal((await get(`?timestamp=${TS}${P}`)).status, 401);
  override = { status: 200, body: Array.from({ length: 1001 }, (_, i) => ({ ...fixtures[1], id: `b-${i}` })) };
  response = await get(`?timestamp=${TS}${P}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).length, 1000, 'default page is 1,000 rows');
  assert.match(response.headers.get('link'), /&limit=1000&offset=1000>; rel="next"$/);
  override = { status: 200, body: [{ ...fixtures[1], value_mv: 'not-a-number' }] };
  assert.equal((await get(`?timestamp=${TS}${P}`)).status, 500, 'non-numeric stored value is an error, not a string value');
  override = null;

  // 10: GET is read-only — only GET requests, never an RPC, always the caller's token and the publishable key.
  assert.ok(seen.length > 0);
  for (const call of seen) {
    assert.equal(call.method, 'GET', call.url);
    assert.doesNotMatch(call.url, /\/rpc\//, call.url);
    assert.equal(call.apikey, 'fictional-publishable-key');
  }
  for (const call of seen.filter((r) => r.url.startsWith('/rest/v1/test_point_readings'))) {
    assert.equal(call.authorization, 'Bearer valid-token');
  }

  // /api/readings alias: same handler and contract as /api/v1/readings/, GET only.
  for (const aliasPath of ['/api/readings', '/api/readings/']) {
    for (const [query, token] of [[`?timestamp=${TS}${P}`, 'valid-token'], [`?timestamp=${TS}&testPointId=${TP1}&field=voltage`, 'valid-token'],
      [`?timestamp=2026-11-02T10:00:01Z${P}`, 'valid-token'], ['', 'valid-token'], [`?timestamp=${TS}`, 'valid-token'],
      [`?timestamp=${TS}&field=value_mv`, 'valid-token'], [`?timestamp=${TS}${P}`, ''], [`?timestamp=${TS}${P}`, 'inactive-token']]) {
      const viaAlias = await get(query, token, aliasPath);
      const viaV1 = await get(query, token);
      assert.equal(viaAlias.status, viaV1.status, `${aliasPath}${query}`);
      assert.equal(viaAlias.headers.get('content-type'), 'application/json');
      assert.match(viaAlias.headers.get('x-request-id'), /^[0-9a-f]{16}$/);
      assert.equal(viaAlias.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(await viaAlias.text(), await viaV1.text(), `${aliasPath}${query}`);
    }
  }
  response = await get('', 'valid-token', '/api/readings');
  assert.equal(await response.text(), exactBadTimestamp, 'alias keeps the exact client 400 body');
  response = await get(`?timestamp=${TS}${P}&limit=1`, 'valid-token', '/api/readings');
  assert.equal(response.headers.get('link'), '</api/readings?timestamp=2026-11-02T10%3A00%3A00.000000Z&field=potential&limit=1&offset=1>; rel="next"',
    'alias pages stay on the alias path');
  const callsBeforeAliasWrites = seen.length;
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    response = await fetch(`${base}/api/readings`, { method, headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_point_id: TP1, reading_ts: '2026-10-24T12:00:00+08:00', value_mv: -850 }) });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('allow'), 'GET', method);
    assert.deepEqual(await response.json(), { message: 'Method not allowed' }, method);
  }
  assert.equal(seen.length, callsBeforeAliasWrites, 'the alias never ingests or contacts Supabase for other methods');

  // POST keeps its own contract: ingestion is disabled here, so it still answers 503 in POST's shape.
  response = await fetch(`${base}/api/v1/readings/`, { method: 'POST', headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ test_point_id: TP1, reading_ts: '2026-10-24T12:00:00+08:00', value_mv: -850 }) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: 'ingestion_disabled' });
});
