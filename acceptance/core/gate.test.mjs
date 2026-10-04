// SPEC §4.29 Package import and content gate: AC-51 to AC-54.
// Fixture: acceptance/fixtures/package (see its FIXTURE.md); helpers in acceptance/fixtures/core/loadPackage.mjs.
// PkgDay's shape is not fixed by the SPEC, so day contents are located by searching each day object for
// the sections (as parseScriptSections returns them), the 8 questions with answers, and the cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';
import { loadPackageFiles, toV11Layout, plantedDefects, GATE_CHECK_IDS } from '../fixtures/core/loadPackage.mjs';

const NOW = Date.UTC(2026, 9, 10, 9, 0, 0);
const DAY = 86400_000;
const FILES = loadPackageFiles();
const DAYS = [0, 1, 2];

function checkStatus(result, id) {
  assert.ok(Array.isArray(result.checks), 'runGate returns checks[]');
  const entries = result.checks.filter((c) => c.id === id);
  assert.ok(entries.length >= 1, `runGate must report check ${id} (got ${[...new Set(result.checks.map((c) => c.id))]})`);
  return { pass: entries.every((c) => c.pass), waived: entries.some((c) => c.waived), detail: entries.map((c) => c.detail).join(' | ') };
}
function summary(result) {
  return Object.fromEntries(GATE_CHECK_IDS.map((id) => [id, checkStatus(result, id).pass]));
}

// --- what the fixture says each day contains (read straight from the fixture files) ---
function diagnostic(n) {
  const md = FILES[`track1/day${n}/quicklearn.md`];
  const [, qPart, aPart] = md.split(/^## (?:8-question diagnostic|Answer key)\s*$/m);
  const items = (s) => s.split('\n').map((l) => /^\d+\.\s+(.*)$/.exec(l)).filter(Boolean).map((m) => m[1].trim());
  const qs = items(qPart), as = items(aPart);
  assert.equal(qs.length, 8); assert.equal(as.length, 8);
  return qs.map((q, i) => ({ q, a: as[i] }));
}
function exercises(n) {
  const md = FILES[`track1/day${n}/memory_recall_day0${n}.md`];
  return md.split(/^## Exercise \d+ — /m).slice(1).map((block) => ({
    title: block.split('\n')[0].replace(/\s*\(\d+ min\)\s*$/, '').trim(),
    todo: /\*\*What to do:\*\*\s*(.*)/.exec(block)[1].trim(),
    answer: /\*\*The answer \(check after\):\*\*\s*(.*)/.exec(block)[1].trim(),
  }));
}
const SECTIONS = [
  { id: 'warm-up', title: 'Warm-up', plannedSec: 900, graded: false },
  { id: 'concept-walkthrough', title: 'Concept walkthrough', plannedSec: 3600, graded: false },
  { id: 'break', title: 'Break', plannedSec: 900, graded: false },
  { id: 'lab', title: 'Lab', plannedSec: 2700, graded: false },
  { id: 'quiz', title: 'Quiz', plannedSec: 900, graded: true },
];

// --- searching a PkgDay ---
function arrays(v, out = [], seen = new Set()) {
  if (!v || typeof v !== 'object' || seen.has(v)) return out;
  seen.add(v);
  if (Array.isArray(v)) out.push(v);
  for (const x of Array.isArray(v) ? v : Object.values(v)) arrays(x, out, seen);
  return out;
}
const proj = (s) => ({ id: s?.id, title: s?.title, plannedSec: s?.plannedSec, graded: s?.graded });
function findSections(day) {
  return arrays(day).find((a) => a.length === SECTIONS.length && a.every((s, i) => JSON.stringify(proj(s)) === JSON.stringify(SECTIONS[i])));
}
function findQuestions(day, diag) {
  return arrays(day).find((a) => a.length === 8 && a.every((x, i) => {
    const s = typeof x === 'string' ? x : JSON.stringify(x);
    return s.includes(diag[i].q) && s.includes(diag[i].a);
  }));
}
function findCards(day, ex) {
  return arrays(day).find((a) => a.length === ex.length && a.every((c, i) => c && typeof c.front === 'string' && typeof c.back === 'string'
    && c.front.includes(ex[i].title) && c.front.includes(ex[i].todo) && c.back.includes(ex[i].answer)));
}
function dayFor(days, n) {
  const marker = diagnostic(n)[0].q;
  const hits = days.filter((d) => JSON.stringify(d).includes(marker));
  assert.equal(hits.length, 1, `exactly one parsed day should hold day ${n}'s diagnostic`);
  return hits[0];
}
function project(days) {
  return DAYS.map((n) => {
    const d = dayFor(days, n);
    const cards = findCards(d, exercises(n));
    return { sections: findSections(d)?.map(proj), questions: !!findQuestions(d, diagnostic(n)), cards: cards?.map((c) => ({ front: c.front, back: c.back })) };
  });
}

test('AC-51 the fixture package (v1.2 layout) passes every gate check', () => {
  const runGate = fn('runGate');
  const r = runGate(FILES, [], NOW);
  const s = summary(r);
  for (const id of GATE_CHECK_IDS) assert.equal(s[id], true, `${id} should pass: ${checkStatus(r, id).detail}`);
  assert.equal(r.pass, true);
  for (const c of r.checks) assert.equal(c.waived, false);
});

test('AC-51 the same package in the v1.1 layout imports with the same days', () => {
  const parsePackage = fn('parsePackage');
  const v12 = parsePackage(FILES);
  const v11files = toV11Layout(FILES);
  assert.ok(Object.keys(v11files).some((p) => /^track1\/memory_recall_day00\.md$/.test(p)), 'fixture helper moved companions');
  const v11 = parsePackage(v11files);
  assert.equal(v12.days.length, 3);
  assert.equal(v11.days.length, 3);
  const p12 = project(v12.days);
  for (const [n, d] of p12.entries()) {
    assert.ok(d.sections, `v1.2 day ${n}: sections found`);
    assert.ok(d.questions, `v1.2 day ${n}: questions found`);
    assert.ok(d.cards, `v1.2 day ${n}: cards found`);
  }
  assert.deepEqual(project(v11.days), p12);
});

test('AC-52 each planted defect fails exactly its own check', () => {
  const runGate = fn('runGate');
  const defects = plantedDefects(FILES);
  assert.deepEqual(Object.keys(defects).sort(), [...GATE_CHECK_IDS].sort());
  for (const id of GATE_CHECK_IDS) {
    const r = runGate(defects[id], [], NOW);
    const s = summary(r);
    const expected = Object.fromEntries(GATE_CHECK_IDS.map((x) => [x, x !== id]));
    assert.deepEqual(s, expected, `planted ${id} defect`);
    assert.equal(r.pass, false, `planted ${id} defect fails the gate`);
  }
});

test('AC-52 (G2 rule) a file that exists but is missing from its README table fails only G2', () => {
  const runGate = fn('runGate');
  const files = { ...FILES, 'track1/day0/extra_notes.md': '# Extra notes\n\nNot listed in the day README.\n' };
  const s = summary(runGate(files, [], NOW));
  assert.deepEqual(s, Object.fromEntries(GATE_CHECK_IDS.map((x) => [x, x !== 'G2-readme'])));
});

const waiver = (check, o = {}) => ({ check, reason: 'Being rewritten this week', by: 'person:admin-1', expiresAt: NOW + 3 * DAY, ...o });

test('AC-53 a waiver turns a failed G1-G6/G8 check into waived until it expires', () => {
  const runGate = fn('runGate');
  const defects = plantedDefects(FILES);
  for (const id of GATE_CHECK_IDS.filter((x) => x !== 'G7-graded')) {
    const r = runGate(defects[id], [waiver(id)], NOW);
    const st = checkStatus(r, id);
    assert.equal(st.waived, true, `${id} waived`);
    assert.equal(r.pass, true, `${id}: a waived check no longer blocks the gate`);
  }
  const w = waiver('G3-diagnostic');
  assert.equal(checkStatus(runGate(defects['G3-diagnostic'], [w], w.expiresAt - 1), 'G3-diagnostic').waived, true, 'just before expiry');
  const expired = runGate(defects['G3-diagnostic'], [w], w.expiresAt + 1);
  assert.equal(checkStatus(expired, 'G3-diagnostic').waived, false, 'expired waiver ignored');
  assert.equal(expired.pass, false);
});

test('AC-53 a waiver for G7 is ignored; a waiver for another check does not waive this one', () => {
  const runGate = fn('runGate');
  const defects = plantedDefects(FILES);
  const r = runGate(defects['G7-graded'], [waiver('G7-graded')], NOW);
  const st = checkStatus(r, 'G7-graded');
  assert.equal(st.pass, false);
  assert.equal(st.waived, false);
  assert.equal(r.pass, false);
  const other = runGate(defects['G5-links'], [waiver('G6-code-lang')], NOW);
  assert.equal(checkStatus(other, 'G5-links').waived, false);
  assert.equal(other.pass, false);
  const ok = runGate(defects['G5-links'], [waiver('G5-links')], NOW);
  assert.equal(ok.pass, true, 'sanity: the matching waiver works');
});

test('AC-54 parsePackage extracts day sections (via parseScriptSections), 8 questions with answers, and cards', () => {
  const parsePackage = fn('parsePackage'), parseScriptSections = fn('parseScriptSections');
  const { days } = parsePackage(FILES);
  assert.equal(days.length, 3);
  for (const n of DAYS) {
    const d = dayFor(days, n);
    assert.equal(days.indexOf(d), n, `day ${n} is in position ${n}`);
    assert.deepEqual(parseScriptSections(FILES[`track1/day${n}/instructor_script.md`]), SECTIONS, `day ${n} script parses`);
    assert.ok(findSections(d), `day ${n}: sections from the instructor script`);
    assert.ok(findQuestions(d, diagnostic(n)), `day ${n}: 8 diagnostic questions with their answers`);
    assert.ok(findCards(d, exercises(n)), `day ${n}: 3 cards from the memory-recall file (front = title + what to do, back = answer)`);
  }
});
