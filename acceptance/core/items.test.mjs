// SPEC §4.21 Item analysis: AC-39. Matrix and hand-computed values: acceptance/fixtures/core/items.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fn } from '../lib/core.mjs';
import { FIXTURES } from '../lib/paths.mjs';

const FX = JSON.parse(readFileSync(join(FIXTURES, 'core', 'items.json'), 'utf8'));
const rows = Object.entries(FX.matrix).flatMap(([personId, marks]) =>
  marks.map((m, i) => ({ personId: `person:${personId}`, itemId: FX.items[i], correct: m === 1 })));

test('AC-39 p and discrimination match the hand-computed values to 3 decimals; flags are right', () => {
  const itemAnalysis = fn('itemAnalysis');
  const out = itemAnalysis(rows);
  assert.deepEqual(out.map((r) => r.itemId).sort(), [...FX.items].sort());
  for (const r of out) {
    const e = FX.expected[r.itemId];
    assert.ok(Math.abs(r.p - e.p) < 0.0005, `${r.itemId} p ${r.p} != ${e.p}`);
    assert.ok(Math.abs(r.discrimination - e.discrimination) < 0.0005, `${r.itemId} discrimination ${r.discrimination} != ${e.discrimination}`);
    assert.equal(r.flag, e.flag, `${r.itemId} flag`);
  }
  assert.equal(out.find((r) => r.itemId === FX.plantedBadItem).flag, true, 'the planted bad item is flagged');
});

test('AC-39 row order does not matter', () => {
  const itemAnalysis = fn('itemAnalysis');
  const byId = (xs) => Object.fromEntries(xs.map((r) => [r.itemId, r]));
  const a = byId(itemAnalysis(rows));
  const b = byId(itemAnalysis([...rows].reverse()));
  for (const id of FX.items) {
    assert.ok(Math.abs(a[id].p - b[id].p) < 1e-9);
    assert.ok(Math.abs(a[id].discrimination - b[id].discrimination) < 1e-9);
    assert.equal(a[id].flag, b[id].flag);
  }
  assert.ok(Math.abs(a.I1.p - FX.expected.I1.p) < 0.0005);
});
