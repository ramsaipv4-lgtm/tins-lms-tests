// SPEC §4.19 Exit tickets and auto-FAQ: AC-37.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

test('AC-37 tallyExitTickets counts choices, most first, then by id', () => {
  const tally = fn('tallyExitTickets');
  const r = tally([{ choiceIds: ['b', 'a'] }, { choiceIds: ['a'] }, { choiceIds: ['d', 'b'] }, { choiceIds: ['a', 'c'] }, { choiceIds: [] }]);
  assert.deepEqual(r, [{ choiceId: 'a', count: 3 }, { choiceId: 'b', count: 2 }, { choiceId: 'c', count: 1 }, { choiceId: 'd', count: 1 }]);
  assert.deepEqual(tally([]), []);
});

const Q = [
  { id: 'q1', text: 'how do I deploy a bicep file' },
  { id: 'q2', text: 'what is the way to deploy a bicep file' },
  { id: 'q3', text: 'How to deploy bicep file' },
  { id: 'q4', text: 'why is my vm not starting' },
  { id: 'q5', text: 'where are the lab slides' },
];

test('AC-37 three rephrasings of "how do I deploy a bicep file" form one FAQ group', () => {
  const suggestFaq = fn('suggestFaq');
  const r = suggestFaq(Q);
  assert.equal(r.length, 1);
  assert.deepEqual([...r[0].ids].sort(), ['q1', 'q2', 'q3']);
  assert.ok(Q.slice(0, 3).some((q) => q.text === r[0].representative), 'representative is one of the grouped questions');
});

test('AC-37 two repeats do not form a group with the default threshold, but do with minRepeats 2', () => {
  const suggestFaq = fn('suggestFaq');
  const two = [Q[0], Q[2], Q[3], Q[4]];
  assert.deepEqual(suggestFaq(two), []);
  const r = suggestFaq(two, 2);
  assert.equal(r.length, 1);
  assert.deepEqual([...r[0].ids].sort(), ['q1', 'q3']);
});
