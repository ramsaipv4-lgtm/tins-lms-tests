// SPEC §4.12 AI policy during graded work: AC-27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const KINDS = ['chat', 'repo-write', 'run-command'];

test('AC-27 off allows nothing, allowed allows everything, explain-only allows chat only', () => {
  const aiAllowed = fn('aiAllowed');
  for (const k of KINDS) {
    assert.equal(aiAllowed('off', k), false, `off/${k}`);
    assert.equal(aiAllowed('allowed', k), true, `allowed/${k}`);
  }
  assert.equal(aiAllowed('explain-only', 'chat'), true);
  assert.equal(aiAllowed('explain-only', 'repo-write'), false);
  assert.equal(aiAllowed('explain-only', 'run-command'), false);
});

test('AC-27 usage summary text', () => {
  const aiUsageSummary = fn('aiUsageSummary');
  const T = Date.UTC(2026, 9, 9, 10, 0, 0);
  const ev = (n, kind = 'chat') => Array.from({ length: n }, (_, i) => ({ at: T + i * 1000, toolKind: kind }));
  assert.equal(aiUsageSummary('off', []), 'AI off');
  assert.equal(aiUsageSummary('allowed', ev(3)), 'AI allowed; used 3 times');
  assert.equal(aiUsageSummary('allowed', [...ev(2), ...ev(3, 'repo-write')]), 'AI allowed; used 5 times');
  assert.equal(aiUsageSummary('allowed', []), 'AI allowed; used 0 times');
  assert.equal(aiUsageSummary('explain-only', ev(2)), 'AI explain-only; used 2 times');
});
