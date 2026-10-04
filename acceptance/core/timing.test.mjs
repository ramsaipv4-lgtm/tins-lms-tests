// SPEC §4.26 Graded timing and accommodations: AC-47, AC-48.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const T = Date.UTC(2026, 9, 12, 15, 0, 0);
const MIN = 60_000;
const sorted = (a) => [...a].sort();

test('AC-47 hub-signed times win when present, with no flags when the device agrees', () => {
  const gradedTiming = fn('gradedTiming');
  const r = gradedTiming({ hubStart: T, hubEnd: T + 45 * MIN, monotonicMs: 44 * MIN, deviceStart: T + 5000, deviceEnd: T + 5000 + 44 * MIN });
  assert.equal(r.durationMs, 45 * MIN);
  assert.deepEqual(r.flags, []);
});

test('AC-47 missing hub times use monotonic with offline-attempt', () => {
  const gradedTiming = fn('gradedTiming');
  for (const [hubStart, hubEnd] of [[null, null], [T, null], [null, T + 40 * MIN]]) {
    const r = gradedTiming({ hubStart, hubEnd, monotonicMs: 38 * MIN, deviceStart: T, deviceEnd: T + 38 * MIN });
    assert.equal(r.durationMs, 38 * MIN);
    assert.deepEqual(r.flags, ['offline-attempt']);
  }
});

test('AC-47 a device clock moved 10 minutes adds clock-skew (more than 60 s only)', () => {
  const gradedTiming = fn('gradedTiming');
  const moved = gradedTiming({ hubStart: null, hubEnd: null, monotonicMs: 30 * MIN, deviceStart: T, deviceEnd: T + 40 * MIN });
  assert.equal(moved.durationMs, 30 * MIN);
  assert.deepEqual(sorted(moved.flags), ['clock-skew', 'offline-attempt']);
  const back = gradedTiming({ hubStart: T, hubEnd: T + 30 * MIN, monotonicMs: 30 * MIN, deviceStart: T, deviceEnd: T + 20 * MIN });
  assert.equal(back.durationMs, 30 * MIN);
  assert.deepEqual(back.flags, ['clock-skew']);
  const edge = gradedTiming({ hubStart: T, hubEnd: T + 30 * MIN, monotonicMs: 30 * MIN, deviceStart: T, deviceEnd: T + 31 * MIN });
  assert.deepEqual(edge.flags, [], 'exactly 60 s is not more than 60 s');
  const over = gradedTiming({ hubStart: T, hubEnd: T + 30 * MIN, monotonicMs: 30 * MIN, deviceStart: T, deviceEnd: T + 31 * MIN + 1 });
  assert.deepEqual(over.flags, ['clock-skew']);
});

test('AC-48 a 1.5x accommodation turns 60 min into 90 min; multiplier defaults to 1 and is clamped to 1-3', () => {
  const eff = fn('effectiveLimitMs');
  assert.equal(eff(60 * MIN, { timeMultiplier: 1.5 }), 90 * MIN);
  assert.equal(eff(60 * MIN, null), 60 * MIN);
  assert.equal(eff(60 * MIN, {}), 60 * MIN);
  assert.equal(eff(60 * MIN, { timeMultiplier: 0.5 }), 60 * MIN);
  assert.equal(eff(60 * MIN, { timeMultiplier: 5 }), 180 * MIN);
  assert.equal(eff(60 * MIN, { timeMultiplier: 3 }), 180 * MIN);
  assert.equal(eff(40 * MIN, { timeMultiplier: 2 }), 80 * MIN);
});
