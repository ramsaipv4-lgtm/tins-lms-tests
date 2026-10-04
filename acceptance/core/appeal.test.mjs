// SPEC §4.11 Appeals: AC-25, AC-26.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const DAY = 86400_000;
const PUB = Date.UTC(2026, 9, 9, 18, 0, 0);
const attempt = (o = {}) => ({ id: 'attempt:a1', publishedAt: PUB, unreadConfirmations: 0, ...o });

test('AC-25 opening within 7 days works; after 7 days it is window-closed', () => {
  const openAppeal = fn('openAppeal');
  const r = openAppeal(attempt(), PUB + 3 * DAY);
  assert.equal(r.ok, true);
  assert.equal(r.appeal.state, 'open');
  assert.ok(Array.isArray(r.appeal.history), 'appeal has a history array');
  assert.equal(openAppeal(attempt(), PUB + 7 * DAY - 1).ok, true);
  assert.deepEqual(openAppeal(attempt(), PUB + 7 * DAY + 1), { ok: false, reason: 'window-closed' });
  assert.deepEqual(openAppeal(attempt(), PUB + 30 * DAY), { ok: false, reason: 'window-closed' });
});

test('AC-25 an attempt with unread confirmations opens directly as upheld (reason unread-confirmation)', () => {
  const openAppeal = fn('openAppeal');
  const r = openAppeal(attempt({ unreadConfirmations: 2 }), PUB + DAY);
  assert.equal(r.ok, true);
  assert.equal(r.appeal.state, 'upheld');
  assert.ok(JSON.stringify(r.appeal).includes('unread-confirmation'), 'the appeal records reason unread-confirmation');
});

test('AC-26 appealTick escalates an open appeal 7 days after it opened, not before', () => {
  const openAppeal = fn('openAppeal'), appealTick = fn('appealTick');
  const opened = PUB + 2 * DAY;
  const a = openAppeal(attempt(), opened).appeal;
  assert.equal(appealTick(a, opened + 7 * DAY - 1).state, 'open');
  const e = appealTick(a, opened + 7 * DAY);
  assert.equal(e.state, 'escalated');
  assert.equal(e.history.length, a.history.length + 1, 'automatic escalation is recorded in history');
  assert.equal(appealTick(a, opened + 8 * DAY).state, 'escalated');
});

test('AC-26 every step is appended to history; the final decision cannot be changed', () => {
  const openAppeal = fn('openAppeal'), step = fn('appealStep'), appealTick = fn('appealTick');
  const t = PUB + DAY;
  const a0 = openAppeal(attempt(), t).appeal;
  const a1 = step(a0, { kind: 'reject', by: 'person:trainer-1', at: t + DAY });
  assert.equal(a1.state, 'rejected');
  const a2 = step(a1, { kind: 'escalate', by: 'person:learner-1', at: t + 2 * DAY });
  assert.equal(a2.state, 'escalated');
  const a3 = step(a2, { kind: 'decide-final', by: 'person:reviewer-2', at: t + 3 * DAY, outcome: 'uphold' });
  assert.equal(a3.state, 'final-upheld');
  const chain = [a0, a1, a2, a3];
  for (let i = 1; i < chain.length; i++) {
    assert.equal(chain[i].history.length, chain[i - 1].history.length + 1, `step ${i} appends one history entry`);
    assert.deepEqual(chain[i].history.slice(0, -1), chain[i - 1].history, `step ${i} keeps earlier history`);
  }
  const attempts = [
    { kind: 'reject', by: 'person:trainer-1', at: t + 4 * DAY },
    { kind: 'uphold', by: 'person:trainer-1', at: t + 4 * DAY },
    { kind: 'escalate', by: 'person:learner-1', at: t + 4 * DAY },
    { kind: 'decide-final', by: 'person:reviewer-3', at: t + 4 * DAY, outcome: 'reject' },
  ];
  for (const act of attempts) {
    let after;
    try { after = step(a3, act); } catch { continue; } // refusing by throwing is fine
    assert.equal(after.state, 'final-upheld', `${act.kind} must not change a final decision`);
  }
  assert.equal(appealTick(a3, t + 60 * DAY).state, 'final-upheld');
});

test('AC-26 trainer uphold and final reject paths', () => {
  const openAppeal = fn('openAppeal'), step = fn('appealStep');
  const t = PUB + DAY;
  const a0 = openAppeal(attempt(), t).appeal;
  const up = step(a0, { kind: 'uphold', by: 'person:trainer-1', at: t + 1000 });
  assert.equal(up.state, 'upheld');
  assert.equal(up.history.length, a0.history.length + 1);
  const esc = step(up, { kind: 'escalate', by: 'person:learner-1', at: t + 2000 });
  assert.equal(esc.state, 'escalated');
  const fin = step(esc, { kind: 'decide-final', by: 'person:reviewer-2', at: t + 3000, outcome: 'reject' });
  assert.equal(fin.state, 'final-rejected');
  assert.equal(fin.history.length, a0.history.length + 3);
});
