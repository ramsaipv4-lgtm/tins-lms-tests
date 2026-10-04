// SPEC §4.20 At-risk digest: AC-38.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const calm = { lockedMissedDays: 0, overdueCards: 0, daysSinceCommit: 0, lastShiftScorePct: 100 };

test('AC-38 each threshold adds exactly one point at its boundary', () => {
  const atRisk = fn('atRisk');
  assert.deepEqual(atRisk(calm), { level: 'ok', reasons: [] });
  const one = [
    { lockedMissedDays: 1 }, { overdueCards: 50 }, { daysSinceCommit: 5 }, { lastShiftScorePct: 49.9 },
  ];
  for (const o of one) {
    const r = atRisk({ ...calm, ...o });
    assert.equal(r.level, 'watch', JSON.stringify(o));
    assert.equal(r.reasons.length, 1, JSON.stringify(o));
    assert.equal(typeof r.reasons[0], 'string');
    assert.ok(r.reasons[0].length > 3, 'reason in plain words');
  }
  for (const o of [{ overdueCards: 49 }, { daysSinceCommit: 4 }, { lastShiftScorePct: 50 }]) {
    assert.deepEqual(atRisk({ ...calm, ...o }), { level: 'ok', reasons: [] }, JSON.stringify(o));
  }
});

test('AC-38 two or more points is risk, each reason named; all-null input is ok', () => {
  const atRisk = fn('atRisk');
  const two = atRisk({ ...calm, lockedMissedDays: 2, overdueCards: 80 });
  assert.equal(two.level, 'risk');
  assert.equal(two.reasons.length, 2);
  assert.notEqual(two.reasons[0], two.reasons[1]);
  const four = atRisk({ lockedMissedDays: 3, overdueCards: 120, daysSinceCommit: 9, lastShiftScorePct: 10 });
  assert.equal(four.level, 'risk');
  assert.equal(four.reasons.length, 4);
  assert.equal(new Set(four.reasons).size, 4);
  assert.deepEqual(atRisk({ lockedMissedDays: 0, overdueCards: 0, daysSinceCommit: null, lastShiftScorePct: null }), { level: 'ok', reasons: [] });
  assert.deepEqual(atRisk({ lockedMissedDays: null, overdueCards: null, daysSinceCommit: null, lastShiftScorePct: null }), { level: 'ok', reasons: [] });
});
