// SPEC §4.22 Mistake clustering: AC-40.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const norm = (clusters) => clusters.map((c) => ({ signature: [...c.signature].sort(), ids: [...c.ids].sort() }));

test('AC-40 same failing sets in any order cluster together, biggest first, every id once', () => {
  const cluster = fn('clusterSubmissions');
  const subs = [
    { id: 's1', failing: ['t-port', 't-auth'] },
    { id: 's2', failing: ['t-auth', 't-port'] },
    { id: 's3', failing: [] },
    { id: 's4', failing: ['t-port', 't-auth'] },
    { id: 's5', failing: ['t-dns'] },
    { id: 's6', failing: [] },
    { id: 's7', failing: ['t-cert'] },
  ];
  const out = cluster(subs);
  assert.deepEqual(norm(out), [
    { signature: ['t-auth', 't-port'], ids: ['s1', 's2', 's4'] },
    { signature: [], ids: ['s3', 's6'] },
    { signature: ['t-cert'], ids: ['s7'] },
    { signature: ['t-dns'], ids: ['s5'] },
  ]);
  const all = out.flatMap((c) => c.ids);
  assert.equal(all.length, subs.length);
  assert.equal(new Set(all).size, subs.length);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].ids.length >= out[i].ids.length, 'sorted by size');
  assert.deepEqual(cluster([]), []);
});
