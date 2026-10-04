// SPEC §4.14 Study groups: AC-30, AC-31.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const person = (id, m) => ({ id, mastery: m });
const PEOPLE = Array.from({ length: 11 }, (_, i) => person(`person:p${String(i).padStart(2, '0')}`,
  { dns: i % 3 === 0 ? 'mastered' : 'not-yet', git: i % 2 === 0 ? 'mastered' : 'not-yet' }));

function checkPartition(groups, people, label) {
  const ids = groups.flat();
  assert.deepEqual([...ids].sort(), people.map((p) => p.id).sort(), `${label}: everyone exactly once`);
  const sizes = groups.map((g) => g.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${label}: sizes ${sizes} differ by more than 1`);
  assert.ok(sizes.every((s) => s > 0), `${label}: no empty groups`);
}

test('AC-30 everyone appears exactly once and group sizes differ by at most 1', () => {
  const formGroups = fn('formGroups');
  for (let n = 1; n <= PEOPLE.length; n++) {
    for (const size of [2, 3, 4]) {
      const people = PEOPLE.slice(0, n);
      checkPartition(formGroups(people, size, `seed-${n}-${size}`), people, `n=${n} size=${size}`);
    }
  }
});

test('AC-30 the result is deterministic for the same seed', () => {
  const formGroups = fn('formGroups');
  const a = formGroups(PEOPLE, 3, 'class-salt:week-2');
  const b = formGroups(PEOPLE, 3, 'class-salt:week-2');
  assert.deepEqual(a, b);
  checkPartition(a, PEOPLE, 'n=11 size=3');
});

test('AC-30 where possible each group has someone who mastered a skill another member has not', () => {
  const formGroups = fn('formGroups');
  const people = [
    person('person:m1', { dns: 'mastered', git: 'mastered' }), person('person:m2', { dns: 'mastered', git: 'mastered' }),
    person('person:m3', { dns: 'mastered', git: 'mastered' }), person('person:n1', { dns: 'not-yet', git: 'not-yet' }),
    person('person:n2', { dns: 'not-yet', git: 'not-yet' }), person('person:n3', { dns: 'not-yet', git: 'not-yet' }),
  ];
  const by = Object.fromEntries(people.map((p) => [p.id, p]));
  for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
    const groups = formGroups(people, 2, seed);
    checkPartition(groups, people, `seed ${seed}`);
    for (const g of groups) {
      const mixed = g.some((a) => g.some((b) => Object.keys(by[a].mastery).some((s) => by[a].mastery[s] === 'mastered' && by[b].mastery[s] !== 'mastered')));
      assert.ok(mixed, `seed ${seed}: group ${JSON.stringify(g)} has no one to learn from`);
    }
  }
});

test('AC-31 overrides move exactly the named people and keep everyone else in place', () => {
  const applyGroupOverrides = fn('applyGroupOverrides');
  const groups = [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h']];
  const snap = structuredClone(groups);
  const out = applyGroupOverrides(groups, [{ personId: 'b', toGroup: 2 }, { personId: 'g', toGroup: 0 }]);
  const where = (gs) => Object.fromEntries(gs.flatMap((g, i) => g.map((p) => [p, i])));
  const w = where(out);
  assert.equal(w.b, 2);
  assert.equal(w.g, 0);
  for (const p of ['a', 'c', 'd', 'e', 'f', 'h']) assert.equal(w[p], where(snap)[p], `${p} stays in its group`);
  assert.deepEqual(out.flat().sort(), snap.flat().sort(), 'nobody added or lost');
  assert.deepEqual(out[1], ['d', 'e', 'f']);
  assert.deepEqual(out[0].filter((p) => p !== 'g'), ['a', 'c'], 'relative order of the others kept');
  assert.deepEqual(applyGroupOverrides(snap, []), snap);
});
