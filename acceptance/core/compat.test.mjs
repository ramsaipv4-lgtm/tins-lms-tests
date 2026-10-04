// SPEC §4.28 Version compatibility: AC-50.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

test('AC-50 all four cases return the stated action; ok only for sync and upgrade-on-hub', () => {
  const canSync = fn('canSync');
  assert.deepEqual(canSync(7, 7), { ok: true, action: 'sync' });
  assert.deepEqual(canSync(6, 7), { ok: true, action: 'upgrade-on-hub' });
  assert.deepEqual(canSync(5, 7), { ok: true, action: 'upgrade-on-hub' });
  assert.deepEqual(canSync(4, 7), { ok: false, action: 'update-app' });
  assert.deepEqual(canSync(1, 7), { ok: false, action: 'update-app' });
  assert.deepEqual(canSync(8, 7), { ok: false, action: 'update-hub' });
  assert.deepEqual(canSync(1, 1), { ok: true, action: 'sync' });
});
