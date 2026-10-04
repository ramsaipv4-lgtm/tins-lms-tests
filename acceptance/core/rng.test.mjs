// SPEC §4.1 Seeded randomness: AC-1, AC-2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const take = (rng, n) => Array.from({ length: n }, () => rng());

test('AC-1 same seed gives the same first 1,000 values, all in [0, 1)', () => {
  const createRng = fn('createRng');
  const a = take(createRng('class-7:item-3'), 1000);
  const b = take(createRng('class-7:item-3'), 1000);
  assert.deepEqual(a, b);
  for (const [i, v] of a.entries()) {
    assert.equal(typeof v, 'number', `value ${i} is not a number`);
    assert.ok(v >= 0 && v < 1, `value ${i} = ${v} is outside [0, 1)`);
  }
  assert.ok(new Set(a).size > 900, 'sequence should not be (nearly) constant');
});

test('AC-1 different seeds give different sequences', () => {
  const createRng = fn('createRng');
  const seeds = ['a', 'b', 'seed-1', 'seed-2', 'seed-10', '', 'class-7:item-3', 'class-8:item-3'];
  const seqs = seeds.map((s) => JSON.stringify(take(createRng(s), 20)));
  assert.equal(new Set(seqs).size, seeds.length, 'every seed must give its own sequence');
});

test('AC-1 values in [0, 1) for 200 generated seeds', () => {
  const createRng = fn('createRng');
  for (let k = 0; k < 200; k++) {
    const seed = `gen-${k}-${(k * 2654435761) % 1000}`;
    const r = createRng(seed);
    const vals = [];
    for (let i = 0; i < 50; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `seed ${JSON.stringify(seed)} value ${i} = ${v}`);
      vals.push(v);
    }
    assert.ok(new Set(vals).size >= 45, `seed ${JSON.stringify(seed)}: values should vary`);
  }
});

test('AC-2 seedFor is stable and differs between classes for the same item', () => {
  const seedFor = fn('seedFor');
  const a1 = seedFor('salt-class-A', 'quiz:day1');
  const a2 = seedFor('salt-class-A', 'quiz:day1');
  const b = seedFor('salt-class-B', 'quiz:day1');
  assert.equal(typeof a1, 'string');
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
  assert.notEqual(seedFor('salt-class-A', 'quiz:day2'), a1, 'different items should give different seeds');
});

test('AC-2 shuffle returns a permutation, never mutates, and is identical for identical rng seeds', () => {
  const createRng = fn('createRng');
  const shuffle = fn('shuffle');
  const items = Object.freeze(Array.from({ length: 30 }, (_, i) => `q${i}`));
  const copy = [...items];
  const s1 = shuffle(items, createRng('seed-x'));
  const s2 = shuffle(items, createRng('seed-x'));
  assert.notEqual(s1, items, 'must return a new array');
  assert.deepEqual(items, copy, 'input must not change');
  assert.deepEqual([...s1].sort(), [...items].sort(), 'must be a permutation');
  assert.equal(s1.length, items.length);
  assert.deepEqual(s1, s2);
  const others = ['seed-y', 'seed-z', 'seed-w'].map((s) => JSON.stringify(shuffle(items, createRng(s))));
  assert.ok(others.some((o) => o !== JSON.stringify(s1)), 'different seeds should usually give a different order');
  assert.notDeepEqual(s1, copy, 'a 30-item shuffle should change the order');
});

test('AC-2 shuffle keeps duplicates and objects (permutation of any input)', () => {
  const createRng = fn('createRng');
  const shuffle = fn('shuffle');
  const o1 = { id: 1 }, o2 = { id: 2 };
  const items = [3, 1, 3, o1, o2, 'x'];
  const out = shuffle(items, createRng('dup'));
  assert.equal(out.length, items.length);
  assert.equal(out.filter((x) => x === 3).length, 2);
  assert.ok(out.includes(o1) && out.includes(o2) && out.includes('x') && out.includes(1));
  assert.deepEqual(shuffle([], createRng('dup')), []);
  const xs = Array.from({ length: 20 }, (_, i) => i);
  assert.ok(['d1', 'd2', 'd3'].some((s) => shuffle(xs, createRng(s)).some((x, i) => x !== i)), 'shuffle must reorder');
});
