// SPEC §4.7 Content release in step with the teleprompter: AC-14, AC-15, AC-16.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { fn, enc, dec } from '../lib/core.mjs';

const DAY_KEY = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
const OTHER_DAY_KEY = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 0xff);
const hex = (b) => Buffer.from(b).toString('hex');

test('AC-14 sectionKey is deterministic, 32 bytes, and differs per section index and day key', async () => {
  const sectionKey = fn('sectionKey');
  const k0 = await sectionKey(DAY_KEY, 0);
  const k0b = await sectionKey(DAY_KEY, 0);
  const k1 = await sectionKey(DAY_KEY, 1);
  assert.ok(k0 instanceof Uint8Array, 'returns a Uint8Array');
  assert.equal(k0.length, 32);
  assert.equal(k1.length, 32);
  assert.equal(hex(k0), hex(k0b));
  assert.notEqual(hex(k0), hex(k1));
  assert.notEqual(hex(k0), hex(await sectionKey(OTHER_DAY_KEY, 0)));
  const keys = await Promise.all([0, 1, 2, 3, 4, 10].map((i) => sectionKey(DAY_KEY, i)));
  assert.equal(new Set(keys.map(hex)).size, 6);
});

test('AC-14 seal/open round-trips; two seals differ (fresh IV); sealed bytes are IV-prefixed AES-GCM', async () => {
  const sectionKey = fn('sectionKey'), seal = fn('sealSection'), open = fn('openSection');
  const key = await sectionKey(DAY_KEY, 2);
  const text = enc('## Lab\n\nRun `kettle build` and check the public folder. ✓');
  const a = await seal(key, text);
  const b = await seal(key, text);
  assert.ok(a instanceof Uint8Array);
  assert.notEqual(hex(a), hex(b), 'two seals of the same text must differ');
  assert.equal(dec(await open(key, a)), dec(text));
  assert.equal(dec(await open(key, b)), dec(text));
  // IV prefixed (96-bit IV, D-26): decrypt independently with Web Crypto.
  const k = await webcrypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
  const pt = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, k, a.slice(12));
  assert.equal(dec(new Uint8Array(pt)), dec(text));
  assert.equal((await open(key, await seal(key, new Uint8Array(0)))).length, 0, 'empty plaintext round-trips');
});

test('AC-14 a wrong key or one flipped byte makes openSection throw', async () => {
  const sectionKey = fn('sectionKey'), seal = fn('sealSection'), open = fn('openSection');
  const key = await sectionKey(DAY_KEY, 0);
  const wrong = await sectionKey(DAY_KEY, 1);
  const sealed = await seal(key, enc('graded quiz answers'));
  assert.equal(dec(await open(key, sealed)), 'graded quiz answers');
  await assert.rejects(() => open(wrong, sealed), 'wrong key');
  for (const pos of [0, 11, 12, Math.floor(sealed.length / 2), sealed.length - 1]) {
    const t = sealed.slice();
    t[pos] ^= 0x01;
    await assert.rejects(() => open(key, t), `flipped byte at ${pos}`);
  }
});

const START = Date.UTC(2026, 9, 6, 14, 30, 0);
const SECTIONS = [
  { id: 'warm-up', plannedSec: 900, graded: false },
  { id: 'concept', plannedSec: 3600, graded: false },
  { id: 'quiz-1', plannedSec: 600, graded: true },
  { id: 'lab', plannedSec: 2700, graded: false },
  { id: 'quiz-2', plannedSec: 300, graded: true },
];

test('AC-15 releasePlan gives cumulative times from the class start and null for graded sections', () => {
  const releasePlan = fn('releasePlan');
  assert.deepEqual(releasePlan(START, SECTIONS), [
    { id: 'warm-up', at: START },
    { id: 'concept', at: START + 900_000 },
    { id: 'quiz-1', at: null },
    { id: 'lab', at: START + (900 + 3600 + 600) * 1000 },
    { id: 'quiz-2', at: null },
  ]);
  assert.deepEqual(releasePlan(START, []), []);
});

test('AC-16 ungraded section: released by reaching it, by releaseAll, or by time', () => {
  const releasePlan = fn('releasePlan'), isReleased = fn('isReleased');
  const plan = releasePlan(START, SECTIONS);
  const lab = SECTIONS[3];
  const labAt = START + 5100_000;
  const ctx = (o) => ({ now: START, reachedIds: [], releaseAll: false, ...o });
  assert.equal(isReleased(lab, plan, ctx({ now: labAt - 1 })), false, 'before its time, not reached');
  assert.equal(isReleased(lab, plan, ctx({ now: labAt })), true, 'at its planned time');
  assert.equal(isReleased(lab, plan, ctx({ reachedIds: ['warm-up', 'lab'] })), true, 'reached by the teleprompter');
  assert.equal(isReleased(lab, plan, ctx({ releaseAll: true })), true, 'release all');
});

test('AC-16 graded section is never released by time alone, only by reaching it or releaseAll', () => {
  const releasePlan = fn('releasePlan'), isReleased = fn('isReleased');
  const plan = releasePlan(START, SECTIONS);
  const quiz = SECTIONS[2];
  const ctx = (o) => ({ now: START, reachedIds: [], releaseAll: false, ...o });
  assert.equal(isReleased(quiz, plan, ctx({ now: START + 365 * 86400_000 })), false, 'a year later, still sealed');
  assert.equal(isReleased(quiz, plan, ctx({ reachedIds: ['warm-up', 'concept'], now: START + 9000_000 })), false, 'other sections reached');
  assert.equal(isReleased(quiz, plan, ctx({ reachedIds: ['quiz-1'] })), true, 'reached');
  assert.equal(isReleased(quiz, plan, ctx({ releaseAll: true })), true, 'release all');
  assert.equal(isReleased(SECTIONS[0], plan, ctx({})), true, 'first ungraded section is due at the start');
});
