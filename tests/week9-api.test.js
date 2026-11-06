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
test('PHP reading validator: types, ranges, timestamps, injection and batch rejection', { skip: !available }, () => {
  const result = spawnSync(php, ['tests/php/reading-validation.php'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /56 PHP validation cases passed/);
});

test('HTTP API with isolated Supabase stub: authentication, scope, errors, limits and headers', { skip: !available }, async (t) => {
  const point = '00000000-0000-4000-8000-000000000001';
  let rpcCode = null;
  let writes = 0;
  const backend = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') {
      if (req.headers.authorization !== 'Bearer valid-token') { res.writeHead(401); res.end('{}'); return; }
      res.end(JSON.stringify({ id: 'fictional-machine-user' })); return;
    }
    assert.equal(req.url, '/rest/v1/rpc/ingest_reading_v1');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      assert.equal(payload.p_reading.test_point_id, point);
      writes++;
      if (rpcCode) { res.writeHead(400); res.end(JSON.stringify({ code: rpcCode, message: 'PRIVATE DB DETAILS' })); }
      else res.end(JSON.stringify('00000000-0000-4000-8000-000000000002'));
    });
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => backend.close(resolve)));
  // Reserve an ephemeral port before starting PHP.
  const reservation = http.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const server = spawn(php, ['-d', 'display_errors=0', '-d', 'display_startup_errors=0', '-S', `127.0.0.1:${port}`, 'tests/php/api-router.php'], {
    cwd: root, stdio: 'ignore', env: { ...process.env,
      SUPABASE_URL: `http://127.0.0.1:${backend.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'fictional-publishable-key',
      CPM_INGESTION_ENABLED: '1', CPM_INGESTION_SCOPES: JSON.stringify({ 'fictional-machine-user': [point] }) }
  });
  t.after(() => { server.kill(); });
  const url = `http://127.0.0.1:${port}/api/v1/readings/`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await fetch(url); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  assert.ok(ready, 'PHP test server starts');
  const valid = { test_point_id: point, reading_ts: '2026-10-24T12:00:00+08:00', value_mv: -850 };
  const send = (body = JSON.stringify(valid), token = 'valid-token', type = 'application/json') => fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': type }, body
  });
  let response = await send();
  assert.equal(response.status, 201);
  assert.equal((await response.json()).ok, true);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.ok(response.headers.get('content-security-policy-report-only'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f]{16}$/);
  response = await fetch(url, { method: 'PUT' });
  assert.equal(response.status, 405, 'GET and POST are the only methods');
  assert.equal(response.headers.get('allow'), 'GET, POST');
  assert.equal((await response.json()).error, 'method_not_allowed');
  assert.equal((await send(undefined, '')).status, 401);
  assert.equal((await send(undefined, 'bad-token')).status, 401);
  assert.equal((await send('{')).status, 400);
  assert.equal((await send(JSON.stringify([valid]))).status, 422);
  assert.equal((await send(JSON.stringify({ ...valid, reading_ts: '2026-10-24T25:00:00Z' }))).status, 422);
  assert.equal((await send(JSON.stringify({ ...valid, test_point_id: point.replace(/1$/, '3') }))).status, 403);
  response = await send(' '.repeat(16385));
  assert.equal(response.status, 413, await response.text());
  assert.equal((await send(undefined, 'valid-token', 'text/plain')).status, 415);
  assert.equal((await send(JSON.stringify({ ...valid, reading_ts: '2099-01-01T00:00:00Z' }))).status, 422, 'future readings rejected');
  assert.equal((await send(JSON.stringify({ ...valid, value_mv: 9000 }))).status, 422, 'implausible potential rejected');
  assert.equal((await send(JSON.stringify({ ...valid, power_watts: 10 }))).status, 422, 'power is calculated, never sent');
  assert.equal(writes, 1, 'invalid requests never reach the write RPC');
  // Upper-case IDs match the lower-case scope; rectifier outputs are forwarded.
  response = await send(JSON.stringify({ ...valid, test_point_id: point.toUpperCase(), current_a: 12.5, voltage_v: 24 }));
  assert.equal(response.status, 201);
  assert.equal(writes, 2);
  const base = `http://127.0.0.1:${port}`;
  const requestOptions = { method: 'POST', headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' }, body: JSON.stringify(valid) };
  assert.equal((await fetch(`${base}/insecure`, requestOptions)).status, 403);
  assert.equal((await fetch(`${base}/disabled`, requestOptions)).status, 503);
  response = await fetch(`${base}/misconfigured`, requestOptions);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'ingestion_misconfigured');
  const page = await fetch(`${base}/index.php`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.ok(page.headers.get('permissions-policy'));
  assert.equal(page.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(page.headers.get('strict-transport-security'), null, 'HSTS stays opt-in');
  assert.equal((await fetch(`${base}/php/clear-session.php`, { method: 'POST' })).status, 403, 'CSRF custom header required');
  const sessionOptions = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CPM-Request': '1' }, body });
  assert.equal((await fetch(`${base}/php/set-session.php`, sessionOptions(' '.repeat(16385)))).status, 413);
  assert.equal((await fetch(`${base}/php/set-session.php`, sessionOptions(JSON.stringify({ mode: 'login', access_token: 'valid-token', remember: 'yes' })))).status, 400);
  for (const [code, status] of [['23505', 409], ['23505', 409], ['42501', 403], ['22023', 422], ['P0429', 429], ['XX000', 500]]) {
    rpcCode = code;
    response = await send();
    assert.equal(response.status, status);
    if (status === 429) assert.equal(response.headers.get('retry-after'), '60');
    assert.doesNotMatch(await response.text(), /PRIVATE DB DETAILS/);
  }
});
