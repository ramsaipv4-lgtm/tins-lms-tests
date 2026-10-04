// SPEC §4.23 Plan vs actual re-flow: AC-41.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const PLAN = Object.freeze([
  { dayIndex: 0, topics: ['intro', 'setup', 'cli'] },
  { dayIndex: 1, topics: ['dns', 'ttl'] },
  { dayIndex: 2, topics: ['storage', 'blobs'] },
  { dayIndex: 3, topics: ['review'] },
]);

test('AC-41 uncovered topics move to the start of the next day, in order, and are listed in moved', () => {
  const reflow = fn('reflow');
  const snap = structuredClone(PLAN);
  const r = reflow(PLAN, { 0: ['intro', 'cli'], 1: ['dns'] }, 1);
  assert.deepEqual(r.plan, [
    { dayIndex: 0, topics: ['intro', 'cli'] },
    { dayIndex: 1, topics: ['dns'] },
    { dayIndex: 2, topics: ['setup', 'ttl', 'storage', 'blobs'] },
    { dayIndex: 3, topics: ['review'] },
  ]);
  assert.deepEqual(r.moved, [{ topic: 'setup', from: 0, to: 2 }, { topic: 'ttl', from: 1, to: 2 }]);
  assert.deepEqual(PLAN, snap, 'input plan unchanged');
});

test('AC-41 a fully covered plan is unchanged', () => {
  const reflow = fn('reflow');
  const r = reflow(PLAN, { 0: ['intro', 'setup', 'cli'], 1: ['dns', 'ttl'] }, 1);
  assert.deepEqual(r.plan, structuredClone(PLAN));
  assert.deepEqual(r.moved, []);
  const r0 = reflow(PLAN, { 0: ['setup'] }, 0);
  assert.deepEqual(r0.plan[1].topics, ['intro', 'cli', 'dns', 'ttl']);
  assert.deepEqual(r0.plan[2].topics, ['storage', 'blobs'], 'later days keep their topics');
});
