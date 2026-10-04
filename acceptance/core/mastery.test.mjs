// SPEC §4.4 Mastery map: AC-10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const H = 3600_000;
const T = Date.UTC(2026, 9, 1, 8, 0, 0);

test('AC-10 0.8 and 0.9 25 h apart is mastered; 2 h apart is not-yet', () => {
  const masteryMap = fn('masteryMap');
  assert.deepEqual(masteryMap([{ skill: 'dns', score: 0.8, at: T }, { skill: 'dns', score: 0.9, at: T + 25 * H }]), { dns: 'mastered' });
  assert.deepEqual(masteryMap([{ skill: 'dns', score: 0.8, at: T }, { skill: 'dns', score: 0.9, at: T + 2 * H }]), { dns: 'not-yet' });
});

test('AC-10 a later 0.5 after mastery is not-yet; one check is not-yet; unchecked skills absent', () => {
  const masteryMap = fn('masteryMap');
  const r = masteryMap([
    { skill: 'dns', score: 0.8, at: T }, { skill: 'dns', score: 0.9, at: T + 25 * H }, { skill: 'dns', score: 0.5, at: T + 50 * H },
    { skill: 'git', score: 1, at: T },
  ]);
  assert.deepEqual(r, { dns: 'not-yet', git: 'not-yet' });
  assert.deepEqual(masteryMap([]), {});
});

test('AC-10 uses the two most recent checks by time (input order does not matter); exactly 24 h counts', () => {
  const masteryMap = fn('masteryMap');
  const r = masteryMap([
    { skill: 'vm', score: 0.95, at: T + 48 * H },
    { skill: 'vm', score: 0.3, at: T },
    { skill: 'vm', score: 0.85, at: T + 24 * H },
    { skill: 'net', score: 0.9, at: T + 30 * H },
    { skill: 'net', score: 0.79, at: T },
  ]);
  assert.deepEqual(r, { vm: 'mastered', net: 'not-yet' });
});
