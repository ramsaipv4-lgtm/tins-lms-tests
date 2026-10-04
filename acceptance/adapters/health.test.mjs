// SPEC §7: AC-117 health digest and morning checklist (surface in CONTRACT.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapter, need } from '../lib/adapters.mjs';

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 2, 2, 0);

test('AC-117 the digest lists last backup per target, sync lag and failed checks, and turns red when a backup is older than 48 h', { timeout: 60_000 }, async () => {
  const healthDigest = need(await loadAdapter('health'), 'healthDigest');
  const fresh = await healthDigest({ now: NOW, backups: [{ target: 's3', lastSuccessAt: NOW - 47 * H }, { target: 'folder', lastSuccessAt: NOW - 2 * H }], syncLagMs: 4000, checks: [{ id: 'disk', ok: true }] });
  assert.equal(fresh.status, 'green', 'all backups within 48 h -> green');
  assert.deepEqual(fresh.backups.map((b) => [b.target, b.lastSuccessAt, b.stale]), [['s3', NOW - 47 * H, false], ['folder', NOW - 2 * H, false]], 'last success per target');
  assert.equal(fresh.syncLagMs, 4000, 'sync lag shown');
  assert.deepEqual(fresh.failedChecks, []);

  const old = await healthDigest({ now: NOW, backups: [{ target: 's3', lastSuccessAt: NOW - 48 * H - 1000 }, { target: 'drive', lastSuccessAt: null }], syncLagMs: 0, checks: [{ id: 'disk', ok: true }, { id: 'cert-expiry', ok: false }] });
  assert.equal(old.status, 'red', 'a backup older than 48 h turns the digest red');
  assert.equal(old.backups.find((b) => b.target === 's3').stale, true);
  assert.equal(old.backups.find((b) => b.target === 'drive').stale, true, 'never backed up counts as stale');
  assert.deepEqual(old.failedChecks, ['cert-expiry'], 'failed checks are listed');
});

test('AC-117 the morning checklist runs offline checks first and shows last-known times for online ones when offline', { timeout: 60_000 }, async () => {
  const run = need(await loadAdapter('health'), 'runMorningChecklist');
  const order = [];
  const mk = (id, kind, ok, lastKnownAt = null) => ({ id, kind, lastKnownAt, run: async () => { order.push(id); return ok; } });
  const checks = [mk('github-reachable', 'online', true, NOW - 5 * H), mk('hub-disk', 'offline', true), mk('backup-s3', 'online', true, NOW - 20 * H), mk('ca-valid', 'offline', false)];
  const offline = await run({ now: NOW, online: false, checks });
  assert.deepEqual(order, ['hub-disk', 'ca-valid'], 'offline: only offline checks run');
  assert.deepEqual(offline.map((r) => r.id), ['hub-disk', 'ca-valid', 'github-reachable', 'backup-s3'], 'offline checks listed first');
  assert.equal(offline.find((r) => r.id === 'ca-valid').ok, false);
  const gh = offline.find((r) => r.id === 'github-reachable');
  assert.equal(gh.ok, null, 'online check not run while offline');
  assert.equal(gh.ranAt, null);
  assert.equal(gh.lastKnownAt, NOW - 5 * H, 'last-known time shown');

  order.length = 0;
  const online = await run({ now: NOW, online: true, checks });
  assert.deepEqual(order.slice(0, 2), ['hub-disk', 'ca-valid'], 'online: offline checks still run first');
  assert.equal(order.length, 4, 'then the online checks run');
  assert.equal(online.find((r) => r.id === 'backup-s3').ok, true);
});
