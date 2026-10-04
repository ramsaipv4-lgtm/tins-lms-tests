// SPEC §4.13 Conflict merge: AC-28 (properties on generated revisions), AC-29 (examples).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const T = Date.UTC(2026, 9, 1);
const CASES = 200;
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const subset = (r, xs) => { const s = xs.filter(() => r() < 0.5); return s.length ? s : [pick(r, xs)]; };
const STATUSES = ['todo', 'doing', 'review', 'done'];
const BY = ['person:ana', 'person:ben', 'person:zed', 'hub:main'];
const AT = [T + 1000, T + 2000, T + 3000, T + 4000];
const HISTORY = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((id, i) => ({ id, note: `note ${id}`, at: T + i }));
const VOTES = ['p1', 'p2', 'p3', 'p4', 'p5'].map((p) => ({ id: `vote:${p}`, personId: `person:${p}` }));

// Each revision gets a unique (updatedAt, updatedBy) pair so "latest wins" is always defined.
function stamps(r, n) {
  const used = new Set(); const out = [];
  while (out.length < n) {
    const at = pick(r, AT), by = pick(r, BY), k = `${at}|${by}`;
    if (!used.has(k)) { used.add(k); out.push({ updatedAt: at, updatedBy: by }); }
  }
  return out;
}
const GEN = {
  ticket: (r, s) => ({ type: 'ticket', id: 'ticket:t1', schema: 1, ...s, title: pick(r, ['Fix DNS', 'Fix DNS record', 'Add TTL']),
    status: pick(r, STATUSES), points: pick(r, [1, 2, 3, 5]), assignee: pick(r, [null, 'person:ana', 'person:ben']), history: subset(r, HISTORY) }),
  person: (r, s) => ({ type: 'person', id: 'person:p9', schema: 1, ...s, name: pick(r, ['Asha', 'Asha K', 'A. K.']),
    roles: pick(r, [['learner'], ['learner', 'coordinator'], ['trainer']]), phone: pick(r, ['9000000001', '9000000002']), minor: pick(r, [true, false]) }),
  doubt: (r, s) => ({ type: 'doubt', id: 'doubt:d1', schema: 1, ...s, personId: null, text: pick(r, ['Why TTL?', 'Why is TTL needed?']),
    answered: pick(r, [true, false]), votes: subset(r, VOTES) }),
};
const genCase = (type, seed, n) => {
  const r = mulberry32(seed);
  return stamps(r, n).map((s) => GEN[type](r, s));
};
function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}
function forCases(name, body) {
  for (const type of Object.keys(GEN)) {
    for (let seed = 1; seed <= CASES; seed++) {
      const revs = genCase(type, seed * 7919 + type.length, 2 + (seed % 3));
      try { body(type, revs); } catch (e) {
        e.message = `${name} failed for ${type}, seed ${seed}, revisions:\n${JSON.stringify(revs, null, 1)}\n${e.message}`;
        throw e;
      }
    }
  }
}

test('AC-28 merging is order-independent (every permutation gives the same result)', () => {
  const merge = fn('mergeRevisions');
  forCases('order-independence', (type, revs) => {
    const ref = merge(type, revs);
    for (const p of permutations(revs)) assert.deepEqual(merge(type, p), ref);
  });
});

test('AC-28 merging is idempotent (merging a result with itself changes nothing)', () => {
  const merge = fn('mergeRevisions');
  forCases('idempotence', (type, revs) => {
    const m = merge(type, revs).doc;
    assert.equal(m.updatedAt, Math.max(...revs.map((r) => r.updatedAt)), 'the merged revision carries the latest updatedAt');
    assert.deepEqual(merge(type, [m, m]).doc, m);
    assert.deepEqual(merge(type, [m]).doc, m);
  });
});

test('AC-28 merging is associative (grouping does not matter)', () => {
  const merge = fn('mergeRevisions');
  forCases('associativity', (type, revs) => {
    if (revs.length < 3) return;
    const [a, b, c] = revs;
    const left = merge(type, [merge(type, [a, b]).doc, c]).doc;
    const right = merge(type, [a, merge(type, [b, c]).doc]).doc;
    const flat = merge(type, [a, b, c]).doc;
    assert.deepEqual(left, right);
    assert.deepEqual(left, flat);
    assert.equal(flat.updatedAt, Math.max(a.updatedAt, b.updatedAt, c.updatedAt), 'latest updatedAt wins');
    if (type === 'ticket') assert.equal(flat.status, [a, b, c].map((r) => r.status).sort((x, y) => STATUSES.indexOf(y) - STATUSES.indexOf(x))[0], 'most advanced status');
  });
});

const tk = (o) => ({ type: 'ticket', id: 'ticket:t7', schema: 1, title: 'Fix DNS', points: 3, assignee: null, history: [], ...o });

test('AC-29 ticket doing vs done merges to done with conflictBadge; equal statuses give no badge', () => {
  const merge = fn('mergeRevisions');
  const a = tk({ status: 'done', updatedAt: T + 1000, updatedBy: 'person:ana' });
  const b = tk({ status: 'doing', updatedAt: T + 2000, updatedBy: 'person:ben', title: 'Fix DNS record' });
  const r = merge('ticket', [a, b]);
  assert.equal(r.doc.status, 'done');
  assert.equal(r.conflictBadge, true);
  assert.equal(r.doc.title, 'Fix DNS record', 'other fields: latest wins');
  const same = merge('ticket', [tk({ status: 'review', updatedAt: T + 1000, updatedBy: 'person:ana' }), tk({ status: 'review', updatedAt: T + 2000, updatedBy: 'person:ben', points: 5 })]);
  assert.equal(same.doc.status, 'review');
  assert.equal(same.conflictBadge, false);
  assert.equal(same.doc.points, 5);
});

test('AC-29 latest updatedAt wins for profile documents, ties broken by the larger updatedBy', () => {
  const merge = fn('mergeRevisions');
  const p = (o) => ({ type: 'person', id: 'person:p1', schema: 1, name: 'Asha', roles: ['learner'], minor: false, ...o });
  assert.equal(merge('person', [p({ name: 'Old', updatedAt: T + 1, updatedBy: 'person:zed' }), p({ name: 'New', updatedAt: T + 2, updatedBy: 'person:ana' })]).doc.name, 'New');
  assert.equal(merge('person', [p({ name: 'From zed', updatedAt: T + 5, updatedBy: 'person:zed' }), p({ name: 'From ana', updatedAt: T + 5, updatedBy: 'person:ana' })]).doc.name, 'From zed');
  assert.equal(merge('program', [{ type: 'program', id: 'program:x', schema: 1, name: 'A', timezone: 'Asia/Kolkata', updatedAt: T + 9, updatedBy: 'person:a' },
    { type: 'program', id: 'program:x', schema: 1, name: 'B', timezone: 'Asia/Kolkata', updatedAt: T + 3, updatedBy: 'person:b' }]).doc.name, 'A');
});

test('AC-29 arrays of objects with id are unioned without duplicates', () => {
  const merge = fn('mergeRevisions');
  const h = (id) => ({ id, note: `note ${id}` });
  const r = merge('ticket', [
    tk({ status: 'todo', updatedAt: T + 1, updatedBy: 'person:ana', history: [h('h1'), h('h2')] }),
    tk({ status: 'todo', updatedAt: T + 2, updatedBy: 'person:ben', history: [h('h2'), h('h3')] }),
  ]);
  assert.deepEqual(r.doc.history.map((x) => x.id).sort(), ['h1', 'h2', 'h3']);
  assert.equal(r.doc.history.length, 3);
  const d = (votes, at, by) => ({ type: 'doubt', id: 'doubt:1', schema: 1, text: 'Why?', answered: false, personId: null, votes, updatedAt: at, updatedBy: by });
  const v = (p) => ({ id: `vote:${p}`, personId: `person:${p}` });
  const dv = merge('doubt', [d([v('a')], T + 1, 'person:a'), d([v('b'), v('a')], T + 2, 'person:b'), d([v('c')], T + 3, 'person:c')]);
  assert.deepEqual(dv.doc.votes.map((x) => x.id).sort(), ['vote:a', 'vote:b', 'vote:c']);
});

test('AC-29 a learner\'s change to class-owned fields (passMark, schedule, switches) is ignored', () => {
  const merge = fn('mergeRevisions');
  const c = (o) => ({ type: 'class', id: 'class:c1', schema: 1, cohortId: 'cohort:1', name: 'Batch A', trainerIds: ['person:t1'], seedSalt: 'salt-1', ...o });
  const hub = c({ passMark: 6, schedule: [{ date: '2026-10-06', start: '20:00', end: '22:30' }], switches: { jira: false }, updatedAt: T + 1000, updatedBy: 'hub:main' });
  const learner = c({ name: 'Batch A (renamed)', passMark: 3, schedule: [], switches: { jira: true }, updatedAt: T + 2000, updatedBy: 'person:learner-1' });
  const r = merge('class', [hub, learner]);
  assert.equal(r.doc.passMark, 6);
  assert.deepEqual(r.doc.schedule, hub.schedule);
  assert.deepEqual(r.doc.switches, hub.switches);
  assert.equal(r.doc.name, 'Batch A (renamed)', 'non-class-owned fields still merge latest-wins');
  assert.deepEqual(merge('class', [learner, hub]), r);
  const hub2 = c({ passMark: 7, schedule: hub.schedule, switches: { jira: false }, updatedAt: T + 3000, updatedBy: 'hub:main' });
  assert.equal(merge('class', [hub, learner, hub2]).doc.passMark, 7, 'a later hub revision wins');
});
