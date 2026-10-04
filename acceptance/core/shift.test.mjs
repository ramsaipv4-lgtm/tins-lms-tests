// SPEC §4.10 Shift engine: AC-22, AC-23, AC-24. Uses the fixture pack track1/shift/shift-pack-1.json.
// ShiftState is opaque in the SPEC; the chosen variant of a ticket is found by searching the state for
// an object about that ticket (id or ticketId) holding one of its variant strings (or a variant index).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fn } from '../lib/core.mjs';
import { FIXTURES } from '../lib/paths.mjs';

const PACK = JSON.parse(readFileSync(join(FIXTURES, 'package', 'track1', 'shift', 'shift-pack-1.json'), 'utf8'));
const T0 = Date.UTC(2026, 9, 8, 14, 30, 0);
const MIN = 60_000;
const byId = Object.fromEntries(PACK.tickets.map((t) => [t.id, t]));

function chosenVariant(state, ticket) {
  const found = new Set();
  const seen = new Set();
  const walk = (v) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v.id === ticket.id || v.ticketId === ticket.id) {
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === 'string' && ticket.variants.includes(x)) found.add(x);
        if (typeof x === 'number' && /variant/i.test(k) && ticket.variants[x] !== undefined) found.add(ticket.variants[x]);
      }
    }
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x);
  };
  walk(state);
  assert.equal(found.size, 1, `state must hold exactly one chosen variant for ${ticket.id}, found ${JSON.stringify([...found])}`);
  return [...found][0];
}
const report = (rep) => Object.fromEntries(rep.map((r) => [r.ticketId, r]));
const solve = (state, ids, apply, answers = {}) => {
  let s = state;
  for (const id of ids) {
    const t = byId[id];
    const at = t.arrivesAtMin * MIN;
    s = apply(s, { kind: 'ack', ticketId: id, atMs: at + MIN });
    s = apply(s, { kind: 'resolve', ticketId: id, atMs: at + 2 * MIN, answer: answers[id] ?? t.check.expected });
  }
  return s;
};

test('AC-22 same pack and seed give identical states and variants; different seeds can differ', () => {
  const startShift = fn('startShift');
  const a = startShift(PACK, 'seed-learner-1', T0);
  const b = startShift(PACK, 'seed-learner-1', T0);
  assert.deepEqual(a, b);
  for (const t of PACK.tickets.filter((x) => x.variants)) assert.equal(chosenVariant(a, t), chosenVariant(b, t));
  const t1 = byId.T1;
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(chosenVariant(startShift(PACK, `seed-learner-${i}`, T0), t1));
  assert.ok(seen.size >= 2, `30 seeds should choose at least 2 variants of T1, got ${[...seen]}`);
});

test('AC-22 same seed gives the same ticket order in the SLA report; tickets appear only after arrivesAtMin', () => {
  const startShift = fn('startShift'), slaReport = fn('slaReport');
  const a = startShift(PACK, 'seed-x', T0), b = startShift(PACK, 'seed-x', T0);
  assert.deepEqual(slaReport(a, 59 * MIN).map((r) => r.ticketId), slaReport(b, 59 * MIN).map((r) => r.ticketId));
  const ids = (ms) => slaReport(a, ms).map((r) => r.ticketId).sort();
  assert.deepEqual(ids(30_000), ['T1']);
  assert.deepEqual(ids(5 * MIN - 1), ['T1']);
  assert.deepEqual(ids(6 * MIN), ['T1', 'T2']);
  assert.deepEqual(ids(20 * MIN - 1), ['T1', 'T2']);
  assert.deepEqual(ids(21 * MIN), ['T1', 'T2', 'T3']);
  assert.deepEqual(ids(31 * MIN), ['T1', 'T2', 'T3', 'T4']);
});

test('AC-23 waiting with minutes left, acked, resolved in time, and breached', () => {
  const startShift = fn('startShift'), apply = fn('applyShiftEvent'), slaReport = fn('slaReport');
  let s = startShift(PACK, 'seed-sla', T0);
  // T2 arrives at 5 min with a 15 min SLA: deadline 20 min.
  const w = report(slaReport(s, 10 * MIN));
  assert.equal(w.T2.status, 'waiting');
  assert.equal(w.T2.minutesLeft, 10);
  assert.equal(w.T1.status, 'waiting');
  assert.equal(w.T1.minutesLeft, 5);
  s = apply(s, { kind: 'ack', ticketId: 'T2', atMs: 6 * MIN });
  assert.equal(report(slaReport(s, 10 * MIN)).T2.status, 'acked');
  s = apply(s, { kind: 'ack', ticketId: 'T1', atMs: 2 * MIN });
  s = apply(s, { kind: 'resolve', ticketId: 'T1', atMs: 10 * MIN, answer: byId.T1.check.expected });
  s = apply(s, { kind: 'resolve', ticketId: 'T2', atMs: 25 * MIN, answer: byId.T2.check.expected });
  const r = report(slaReport(s, 30 * MIN));
  assert.equal(r.T1.status, 'resolved', 'resolved inside its SLA');
  assert.equal(r.T2.status, 'breached', 'resolved after its SLA');
  assert.equal(r.T3.status, 'waiting');
  assert.equal(r.T3.minutesLeft, 20, 'T3 arrives at 20 with a 30 min SLA');
});

test('AC-23 SLA counts from arrival; an unresolved ticket past its SLA is breached', () => {
  const startShift = fn('startShift'), slaReport = fn('slaReport');
  const s = startShift(PACK, 'seed-sla-2', T0);
  assert.equal(report(slaReport(s, 14 * MIN)).T1.status, 'waiting');
  assert.equal(report(slaReport(s, 16 * MIN)).T1.status, 'breached');
  const t4 = report(slaReport(s, 40 * MIN)).T4; // arrives 30, SLA 20 -> deadline 50
  assert.equal(t4.status, 'waiting');
  assert.equal(t4.minutesLeft, 10);
  assert.equal(report(slaReport(s, 51 * MIN)).T4.status, 'breached');
});

test('AC-24 scoreShift uses the rubric rows of the given mode and never exceeds max', () => {
  const startShift = fn('startShift'), apply = fn('applyShiftEvent'), scoreShift = fn('scoreShift');
  const s = solve(startShift(PACK, 'seed-score', T0), ['T1', 'T2', 'T3', 'T4'], apply);
  for (const rub of PACK.rubric) {
    const r = scoreShift(s, rub.mode);
    assert.deepEqual(r.rows.map((x) => x.id), rub.rows.map((x) => x.id), `rows for ${rub.mode}`);
    const weights = Object.fromEntries(rub.rows.map((x) => [x.id, x.weight]));
    for (const row of r.rows) assert.ok(row.earned >= 0 && row.earned <= weights[row.id], `${rub.mode} row ${row.id} earned ${row.earned}`);
    assert.ok(r.score <= r.max, `${rub.mode}: score ${r.score} > max ${r.max}`);
    assert.ok(r.score > 0, `${rub.mode}: a perfect run must earn something`);
    assert.equal(r.score, r.rows.reduce((a, x) => a + x.earned, 0));
    assert.ok(r.max <= rub.rows.reduce((a, x) => a + x.weight, 0));
  }
});

test('AC-24 modeFlag is set only for a mode other than the pack\'s first rubric mode', () => {
  const startShift = fn('startShift'), apply = fn('applyShiftEvent'), scoreShift = fn('scoreShift');
  const s = solve(startShift(PACK, 'seed-mode', T0), ['T1'], apply);
  assert.equal(scoreShift(s, 'live').modeFlag, false);
  assert.equal(scoreShift(s, 'recorded').modeFlag, true);
  assert.equal(scoreShift(s, 'emulated').modeFlag, true);
});

test('AC-24 a wrong answer earns nothing for that ticket', () => {
  const startShift = fn('startShift'), apply = fn('applyShiftEvent'), scoreShift = fn('scoreShift');
  const start = startShift(PACK, 'seed-wrong', T0);
  const perfect = solve(start, ['T1', 'T2', 'T3', 'T4'], apply);
  const wrong = solve(start, ['T1', 'T2', 'T3', 'T4'], apply, { T1: 'restart the server' });
  // Same run, but T1 only acknowledged and never resolved.
  let unresolved = apply(start, { kind: 'ack', ticketId: 'T1', atMs: MIN });
  unresolved = solve(unresolved, ['T2', 'T3', 'T4'], apply);
  for (const mode of ['live', 'recorded', 'emulated']) {
    const p = scoreShift(perfect, mode), w = scoreShift(wrong, mode), u = scoreShift(unresolved, mode);
    assert.ok(w.score < p.score, `${mode}: wrong answer must score less than the right one`);
    assert.equal(w.score, u.score, `${mode}: wrong answer earns the same as not resolving T1`);
  }
});
