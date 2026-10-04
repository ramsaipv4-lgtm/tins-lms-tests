// SPEC §4.6 One-time pairing codes: AC-13.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const T = Date.UTC(2026, 9, 5, 10, 0, 0);
const MIN = 60_000;
const snap = (s) => structuredClone(s);

test('AC-13 a fresh code claims ok once, then used; state never mutated', () => {
  const empty = fn('emptyPairingState'), issue = fn('issuePairing'), claim = fn('claimPairing');
  const s0 = empty();
  const s0snap = snap(s0);
  const s1 = issue(s0, 'K7Q2-9XPA', T);
  assert.deepEqual(s0, s0snap, 'issuePairing must not mutate its input');
  const s1snap = snap(s1);
  const c1 = claim(s1, 'K7Q2-9XPA', 'device:phone-1', T + MIN);
  assert.equal(c1.result, 'ok');
  assert.deepEqual(s1, s1snap, 'claimPairing must not mutate its input');
  const c2 = claim(c1.state, 'K7Q2-9XPA', 'device:phone-2', T + 2 * MIN);
  assert.equal(c2.result, 'used');
  const c3 = claim(c1.state, 'K7Q2-9XPA', 'device:phone-1', T + 2 * MIN);
  assert.equal(c3.result, 'used', 'the same device cannot claim twice either');
});

test('AC-13 default TTL is 5 minutes: claim after it is expired, just before it is ok', () => {
  const empty = fn('emptyPairingState'), issue = fn('issuePairing'), claim = fn('claimPairing');
  const s = issue(empty(), 'ABC123', T);
  assert.equal(claim(s, 'ABC123', 'device:1', T + 5 * MIN - 1).result, 'ok');
  assert.equal(claim(s, 'ABC123', 'device:1', T + 5 * MIN + 1).result, 'expired');
  assert.equal(claim(s, 'ABC123', 'device:1', T + 60 * MIN).result, 'expired');
});

test('AC-13 custom TTL and unknown codes', () => {
  const empty = fn('emptyPairingState'), issue = fn('issuePairing'), claim = fn('claimPairing');
  const s = issue(issue(empty(), 'ONE', T), 'TWO', T, 30_000);
  assert.equal(claim(s, 'TWO', 'device:1', T + 29_000).result, 'ok');
  assert.equal(claim(s, 'TWO', 'device:1', T + 31_000).result, 'expired');
  assert.equal(claim(s, 'ONE', 'device:1', T + 31_000).result, 'ok', 'other codes keep their own TTL');
  assert.equal(claim(s, 'NOPE', 'device:1', T + 1000).result, 'unknown');
  assert.equal(claim(empty(), 'ONE', 'device:1', T).result, 'unknown');
  const after = claim(s, 'ONE', 'device:1', T + 1000).state;
  assert.equal(claim(after, 'TWO', 'device:2', T + 2000).result, 'ok', 'claiming one code leaves others claimable');
});
