// SPEC §4.2 Cards and spaced repetition: AC-3, AC-4, AC-5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const T0 = Date.UTC(2026, 9, 5, 9, 0, 0);
const MIN = 60_000, H = 60 * MIN, DAY = 24 * H;

test('AC-3 on a new card: good is later than hard, hard later than again; again within 24 h; reps + 1', () => {
  const newCard = fn('newCard'), reviewCard = fn('reviewCard');
  const c = newCard('card:1', T0);
  assert.equal(c.id, 'card:1');
  assert.equal(typeof c.due, 'number');
  assert.equal(typeof c.reps, 'number');
  const again = reviewCard(c, 'again', T0);
  const hard = reviewCard(c, 'hard', T0);
  const good = reviewCard(c, 'good', T0);
  assert.ok(good.due > hard.due, `good.due ${good.due} must be later than hard.due ${hard.due}`);
  assert.ok(hard.due > again.due, `hard.due ${hard.due} must be later than again.due ${again.due}`);
  assert.ok(again.due <= T0 + DAY, `again must be due within 24 h (got +${(again.due - T0) / H} h)`);
  for (const r of [again, hard, good]) assert.equal(r.reps, c.reps + 1);
});

test('AC-3 on a card in review: same ordering, again within 24 h, reps + 1', () => {
  const newCard = fn('newCard'), reviewCard = fn('reviewCard');
  let c = newCard('card:2', T0);
  let t = T0;
  // Learn it with a few on-time 'good' reviews so it reaches the review state.
  for (let i = 0; i < 4; i++) { c = reviewCard(c, 'good', t); t = Math.max(c.due, t + MIN); }
  const now = c.due;
  const again = reviewCard(c, 'again', now);
  const hard = reviewCard(c, 'hard', now);
  const good = reviewCard(c, 'good', now);
  assert.ok(good.due > hard.due, 'good later than hard');
  assert.ok(hard.due > again.due, 'hard later than again');
  assert.ok(again.due <= now + DAY, 'again within 24 h');
  for (const r of [again, hard, good]) assert.equal(r.reps, c.reps + 1);
});

test('AC-3 reviewCard does not change the input card', () => {
  const newCard = fn('newCard'), reviewCard = fn('reviewCard');
  const c = newCard('card:3', T0);
  const snap = structuredClone(c);
  const r = reviewCard(c, 'good', T0 + MIN);
  assert.deepEqual(c, snap);
  assert.equal(r.reps, c.reps + 1, 'the returned card is the reviewed one');
  assert.ok(r.due > c.due, 'the reviewed card is due later');
});

test('AC-4 dueCards returns only due cards, oldest due first, without mutating input', () => {
  const newCard = fn('newCard'), dueCards = fn('dueCards');
  const base = newCard('x', T0);
  const mk = (id, due) => ({ ...base, id, due });
  const cards = Object.freeze([mk('c1', T0 + 5 * H), mk('c2', T0 - 2 * DAY), mk('c3', T0), mk('c4', T0 - H), mk('c5', T0 + 1)]);
  const snap = structuredClone(cards);
  const out = dueCards(cards, T0);
  assert.deepEqual(out.map((c) => c.id), ['c2', 'c4', 'c3']);
  assert.deepEqual(cards, snap, 'input must not change');
  assert.deepEqual(dueCards(cards, T0 - 3 * DAY), []);
  assert.deepEqual(dueCards(cards, T0 + DAY).map((c) => c.id), ['c2', 'c4', 'c3', 'c5', 'c1']);
});

const flatten = (rec, start, days) => {
  const out = [];
  for (let d = start; d < start + days; d++) out.push(...(rec[d] ?? []));
  return out;
};
const keysInRange = (rec, start, days) => Object.keys(rec).every((k) => Number(k) >= start && Number(k) < start + days);

test('AC-5 spreadBacklog with defaults (7 days, 30 per day) keeps order and caps each day', () => {
  const spreadBacklog = fn('spreadBacklog');
  const ids = Object.freeze(Array.from({ length: 150 }, (_, i) => `card:${i}`));
  const rec = spreadBacklog(ids, 100);
  assert.ok(keysInRange(rec, 100, 7), `days must be 100..106, got ${Object.keys(rec)}`);
  assert.deepEqual(flatten(rec, 100, 7), [...ids], 'every id exactly once, in input order');
  for (const [d, list] of Object.entries(rec)) assert.ok(list.length <= 30, `day ${d} has ${list.length} > 30`);
});

test('AC-5 spreadBacklog puts overflow on the last day', () => {
  const spreadBacklog = fn('spreadBacklog');
  const ids = Array.from({ length: 250 }, (_, i) => `c${i}`);
  const rec = spreadBacklog(ids, 0);
  assert.deepEqual(flatten(rec, 0, 7), ids);
  for (let d = 0; d < 6; d++) assert.equal((rec[d] ?? []).length, 30, `day ${d}`);
  assert.equal(rec[6].length, 70, 'last day takes its 30 plus the 40 overflow');
});

test('AC-5 spreadBacklog honours custom days and maxPerDay', () => {
  const spreadBacklog = fn('spreadBacklog');
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const rec = spreadBacklog(ids, 5, 3, 2);
  assert.ok(keysInRange(rec, 5, 3));
  assert.deepEqual(flatten(rec, 5, 3), ids);
  assert.equal(rec[5].length, 2);
  assert.equal(rec[6].length, 2);
  assert.deepEqual(rec[7], ['e', 'f', 'g', 'h', 'i', 'j']);
  const small = spreadBacklog(['a', 'b', 'c'], 0, 4, 2);
  assert.deepEqual(flatten(small, 0, 4), ['a', 'b', 'c']);
  for (const list of Object.values(small)) assert.ok(list.length <= 2);
});
