// SPEC §5.9: AC-78 test routes exist only with LMS_TEST_MODE=1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useServer, client, TEST_TIMEOUT } from '../lib/api.mjs';

const S = useServer({ testMode: false });

test('AC-78 without LMS_TEST_MODE=1 every /__test/* route returns 404', { timeout: TEST_TIMEOUT }, async () => {
  const c = client(S().url);
  const calls = [
    ['POST', '/__test/login', { personId: 'admin1', roles: ['admin'] }],
    ['POST', '/__test/seed', { fixture: 'api/base.json' }],
    ['POST', '/__test/clock', { now: 0 }],
    ['POST', '/__test/reset', {}],
    ['GET', '/__test/login'], ['GET', '/__test/reset'], ['GET', '/__test/anything-else'], ['POST', '/__test/'],
  ];
  for (const [method, path, body] of calls) {
    const r = await c.req(path, { method, body });
    assert.equal(r.status, 404, `${method} ${path} must be 404 without test mode, got ${r.status}`);
  }
  assert.equal(c.cookie, '', 'no session cookie was set by any /__test route');
  const h = await c.req('/api/health');
  assert.equal(h.status, 200, 'the server itself is up (health 200)');
});
