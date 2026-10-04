// SPEC §4.15 Estimation poker: AC-32.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

test('AC-32 consensus examples from the SPEC', () => {
  const pokerRound = fn('pokerRound');
  assert.deepEqual(pokerRound({ ana: 3, ben: 3, cai: 5 }), { result: 'consensus', points: 3 });
  assert.deepEqual(pokerRound({ ana: 3, ben: 5, cai: 5 }), { result: 'consensus', points: 5 });
  assert.deepEqual(pokerRound({ ana: 8, ben: 8, cai: 8 }), { result: 'consensus', points: 8 });
  assert.deepEqual(pokerRound({ ana: 3, ben: 5 }), { result: 'consensus', points: 5 }, 'ties go to the higher card');
  assert.deepEqual(pokerRound({ ana: 8, ben: 13, cai: 13, dev: 8 }), { result: 'consensus', points: 13 });
});

test('AC-32 a spread asks the lowest and highest voters to discuss; a vote of 4 throws', () => {
  const pokerRound = fn('pokerRound');
  assert.deepEqual(pokerRound({ ana: 2, ben: 8, cai: 3 }), { result: 'discuss', low: ['ana'], high: ['ben'] });
  const r = pokerRound({ ana: 1, ben: 5, cai: 1, dev: 3, eli: 5 });
  assert.equal(r.result, 'discuss');
  assert.deepEqual([...r.low].sort(), ['ana', 'cai']);
  assert.deepEqual([...r.high].sort(), ['ben', 'eli']);
  assert.throws(() => pokerRound({ ana: 3, ben: 4 }));
  assert.throws(() => pokerRound({ ana: 21 }));
  assert.throws(() => pokerRound({ ana: 0, ben: 1 }));
});
