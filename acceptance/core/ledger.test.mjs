// SPEC §4.9 Append-only ledger: AC-19, AC-20, AC-21.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const T = Date.UTC(2026, 9, 7, 12, 0, 0);
const ENTRIES = [
  { subject: 'grade:person:l1:quiz-1', value: 5, by: 'person:trainer-1', at: T },
  { subject: 'grade:person:l2:quiz-1', value: { score: 7, max: 8 }, by: 'person:trainer-1', at: T + 1000, reason: 'auto-graded' },
  { subject: 'grade:person:l1:lab-1', value: 'pass', by: 'hub:main', at: T + 2000 },
  { subject: 'grade:person:l3:quiz-1', value: [1, 0, 1], by: 'person:trainer-2', at: T + 3000 },
];

async function build(entries = ENTRIES) {
  const appendEntry = fn('appendEntry');
  let ledger = [];
  for (const e of entries) ledger = await appendEntry(ledger, e);
  return ledger;
}

test('AC-19 appending returns a new array with consecutive seq and a valid hash chain', async () => {
  const appendEntry = fn('appendEntry'), verifyLedger = fn('verifyLedger');
  const first = await appendEntry([], ENTRIES[0]);
  const frozen = Object.freeze(first.slice());
  const snap = structuredClone(frozen);
  const second = await appendEntry(frozen, ENTRIES[1]);
  assert.notEqual(second, frozen);
  assert.deepEqual(frozen, snap, 'input ledger unchanged');
  assert.equal(frozen.length, 1);
  assert.equal(second.length, 2);
  const ledger = await build();
  assert.deepEqual(ledger.map((e) => e.seq), [0, 1, 2, 3]);
  for (const [i, e] of ledger.entries()) {
    assert.match(e.hash, /^[0-9a-f]{64}$/, 'hash is SHA-256 hex');
    assert.equal(e.subject, ENTRIES[i].subject);
    assert.deepEqual(e.value, ENTRIES[i].value);
    assert.equal(e.by, ENTRIES[i].by);
    assert.equal(e.at, ENTRIES[i].at);
    if (i > 0) assert.equal(e.prevHash, ledger[i - 1].hash, `entry ${i} chains to entry ${i - 1}`);
  }
  assert.equal(new Set(ledger.map((e) => e.hash)).size, 4);
  assert.deepEqual(await verifyLedger(ledger), { ok: true, brokenAt: null });
});

const tamper = (v) => {
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'string') return v + 'x';
  if (typeof v === 'boolean') return !v;
  if (v === null) return 'x';
  return { tampered: true };
};

test('AC-20 editing any field of an earlier entry reports brokenAt = that seq', async () => {
  const verifyLedger = fn('verifyLedger');
  const ledger = await build();
  for (const k of [0, 1, 2]) {
    for (const field of Object.keys(ledger[k])) {
      if (ledger[k][field] === undefined) continue;
      const copy = structuredClone(ledger);
      copy[k][field] = tamper(copy[k][field]);
      const r = await verifyLedger(copy);
      assert.equal(r.ok, false, `edit of ${field} in entry ${k} must be detected`);
      assert.equal(r.brokenAt, k, `edit of ${field} in entry ${k}`);
    }
  }
  const nested = structuredClone(ledger);
  nested[1].value.score = 8;
  assert.deepEqual(await verifyLedger(nested), { ok: false, brokenAt: 1 }, 'edit inside an object value');
});

test('AC-21 a correction changes currentValue and keeps the original entry unchanged', async () => {
  const appendEntry = fn('appendEntry'), currentValue = fn('currentValue'), verifyLedger = fn('verifyLedger');
  const ledger = await build();
  const before = structuredClone(ledger);
  assert.equal(currentValue(ledger, 'grade:person:l1:quiz-1'), 5);
  const corrected = await appendEntry(ledger, {
    subject: 'grade:person:l1:quiz-1', value: 6, by: 'person:trainer-1', at: T + 10_000, reason: 'appeal upheld', corrects: 0,
  });
  assert.equal(corrected.length, 5);
  assert.equal(corrected[4].seq, 4);
  assert.equal(corrected[4].corrects, 0);
  assert.equal(currentValue(corrected, 'grade:person:l1:quiz-1'), 6);
  assert.deepEqual(corrected.slice(0, 4), before, 'original entries still present and unchanged');
  assert.deepEqual(ledger, before);
  assert.deepEqual(currentValue(corrected, 'grade:person:l2:quiz-1'), { score: 7, max: 8 }, 'other subjects unaffected');
  assert.deepEqual(await verifyLedger(corrected), { ok: true, brokenAt: null });
});
