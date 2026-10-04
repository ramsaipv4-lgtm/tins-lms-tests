// Smoke (visible to builders): the server starts as SPEC §2 describes and GET /api/health answers (SPEC AC-60).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../lib/server.mjs';

test('smoke: server prints LISTENING <port> and /api/health is ok', { timeout: 60_000 }, async () => {
  const s = await start({ testMode: true });
  try {
    const r = await s.request('/api/health');
    assert.equal(r.status, 200, `GET /api/health -> ${r.status}`);
    assert.equal(r.json?.ok, true, 'health body has ok: true');
    assert.equal(r.json?.profile, 'hub', 'health body names the profile');
  } finally { await s.stop(); }
});
