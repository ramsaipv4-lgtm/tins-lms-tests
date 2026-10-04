// SPEC §4.3 Catch-up gate: AC-6 to AC-9.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const DAYS = ['day-0', 'day-1', 'day-2', 'day-3', 'day-4', 'day-5'];
const same = (a, b, msg) => assert.deepEqual([...a].sort(), [...b].sort(), msg);

test('AC-6 a learner who attended every day has nothing missed and nothing blocked', () => {
  const catchUpState = fn('catchUpState');
  const r = catchUpState({ dayIds: DAYS, todayIndex: 3, attended: ['day-0', 'day-1', 'day-2'], bestScores: {} });
  assert.deepEqual(r.missed, []);
  assert.equal(r.nextGate, null);
  for (const d of ['day-0', 'day-1', 'day-2', 'day-3']) assert.ok(r.unlocked.includes(d), `${d} unlocked`);
  assert.equal(r.selfStudyBlocked, false);
});

test('AC-7 joined on day 3: gate is day 0, day 1 does not unlock before day 0', () => {
  const catchUpState = fn('catchUpState');
  const base = { dayIds: DAYS, todayIndex: 3, attended: [] };
  const r0 = catchUpState({ ...base, bestScores: {} });
  assert.deepEqual(r0.missed, ['day-0', 'day-1', 'day-2']);
  assert.equal(r0.nextGate, 'day-0');
  assert.equal(r0.selfStudyBlocked, true);

  const r1 = catchUpState({ ...base, bestScores: { 'day-1': 8 } });
  assert.equal(r1.nextGate, 'day-0');
  assert.ok(!r1.unlocked.includes('day-1'), 'day 1 passed before day 0 must stay locked');
  assert.ok(!r1.unlocked.includes('day-0'));

  const r2 = catchUpState({ ...base, bestScores: { 'day-0': 6 } });
  assert.equal(r2.nextGate, 'day-1');
  assert.ok(r2.unlocked.includes('day-0'));
  assert.ok(!r2.unlocked.includes('day-1'));
  assert.equal(r2.selfStudyBlocked, true);
});

test('AC-7 once day 0 passes, an earlier day 1 pass counts (in-order rule) and the gate moves on', () => {
  const catchUpState = fn('catchUpState');
  const r = catchUpState({ dayIds: DAYS, todayIndex: 3, attended: [], bestScores: { 'day-0': 7, 'day-1': 8 } });
  assert.equal(r.nextGate, 'day-2');
  assert.ok(r.unlocked.includes('day-0') && r.unlocked.includes('day-1'));
  const all = catchUpState({ dayIds: DAYS, todayIndex: 3, attended: [], bestScores: { 'day-0': 6, 'day-1': 6, 'day-2': 6 } });
  assert.equal(all.nextGate, null);
  assert.equal(all.selfStudyBlocked, false);
  for (const d of ['day-0', 'day-1', 'day-2', 'day-3']) assert.ok(all.unlocked.includes(d));
});

test('AC-8 pass mark: 5/8 locked, 6/8 unlocks by default, class pass mark 7 respected, today always open', () => {
  const catchUpState = fn('catchUpState');
  const base = { dayIds: DAYS, todayIndex: 2, attended: ['day-1'] };
  const r5 = catchUpState({ ...base, bestScores: { 'day-0': 5 } });
  assert.deepEqual(r5.missed, ['day-0']);
  assert.equal(r5.nextGate, 'day-0');
  assert.ok(!r5.unlocked.includes('day-0'));
  assert.ok(r5.unlocked.includes('day-2'), 'today stays unlocked while a missed day is locked');
  assert.ok(r5.unlocked.includes('day-1'), 'attended days stay unlocked');
  assert.equal(r5.selfStudyBlocked, true);

  const r6 = catchUpState({ ...base, bestScores: { 'day-0': 6 } });
  assert.ok(r6.unlocked.includes('day-0'));
  assert.equal(r6.nextGate, null);
  assert.equal(r6.selfStudyBlocked, false);

  const p7a = catchUpState({ ...base, bestScores: { 'day-0': 6 }, passMark: 7 });
  assert.ok(!p7a.unlocked.includes('day-0'));
  assert.equal(p7a.nextGate, 'day-0');
  const p7b = catchUpState({ ...base, bestScores: { 'day-0': 7 }, passMark: 7 });
  assert.ok(p7b.unlocked.includes('day-0'));
  assert.equal(p7b.nextGate, null);
});

test('AC-8 attended days are never missed, missed days come in day order', () => {
  const catchUpState = fn('catchUpState');
  const r = catchUpState({ dayIds: DAYS, todayIndex: 5, attended: ['day-3', 'day-0'], bestScores: { 'day-1': 6 } });
  assert.deepEqual(r.missed, ['day-1', 'day-2', 'day-4']);
  assert.equal(r.nextGate, 'day-2');
  same(r.unlocked.filter((d) => DAYS.indexOf(d) <= 5), ['day-0', 'day-1', 'day-3', 'day-5']);
});

test('AC-9 gradedDueDate is exactly 7 x 24 h later by default and honours a custom extension', () => {
  const gradedDueDate = fn('gradedDueDate');
  const t = Date.UTC(2026, 9, 10, 18, 45, 12, 345);
  assert.equal(gradedDueDate(t), t + 7 * 24 * 3600_000);
  assert.equal(gradedDueDate(t, 10), t + 10 * 24 * 3600_000);
  assert.equal(gradedDueDate(t, 3), t + 3 * 24 * 3600_000);
});
