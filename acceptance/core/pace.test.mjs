// SPEC §4.8 Teleprompter pacing and rehearsal: AC-17, AC-18.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fn } from '../lib/core.mjs';
import { FIXTURES } from '../lib/paths.mjs';

const T = Date.UTC(2026, 9, 6, 14, 30, 0);
const S = 1000;

test('AC-17 600 s + 600 s, entries at 0 and 720 s, now 900 s: delta 120, current second, behind 120', () => {
  const pace = fn('pace');
  const sections = [{ id: 'intro', plannedSec: 600 }, { id: 'demo', plannedSec: 600 }, { id: 'wrap', plannedSec: 300 }];
  const r = pace(sections, [{ sectionId: 'intro', at: T }, { sectionId: 'demo', at: T + 720 * S }], T + 900 * S);
  assert.deepEqual(r.perSection[0], { id: 'intro', actualSec: 720, deltaSec: 120 });
  assert.equal(r.perSection[1].id, 'demo');
  assert.equal(r.perSection[1].actualSec, 180);
  assert.deepEqual(r.perSection[2], { id: 'wrap', actualSec: null, deltaSec: null });
  assert.equal(r.currentId, 'demo');
  assert.equal(r.behindSec, 120);
});

test('AC-17 the current section counts only once it overruns; nothing entered gives nulls', () => {
  const pace = fn('pace');
  const sections = [{ id: 'intro', plannedSec: 600 }, { id: 'demo', plannedSec: 600 }];
  const events = [{ sectionId: 'intro', at: T }, { sectionId: 'demo', at: T + 720 * S }];
  const over = pace(sections, events, T + (720 + 700) * S);
  assert.equal(over.perSection[1].actualSec, 700);
  assert.equal(over.perSection[1].deltaSec, 100);
  assert.equal(over.behindSec, 220);
  const early = pace(sections, [{ sectionId: 'intro', at: T }, { sectionId: 'demo', at: T + 500 * S }], T + 600 * S);
  assert.equal(early.perSection[0].deltaSec, -100);
  assert.equal(early.behindSec, -100, 'finished deltas count even when negative; current has no overrun');
  const none = pace(sections, [], T);
  assert.equal(none.currentId, null);
  assert.equal(none.behindSec, 0);
  assert.deepEqual(none.perSection, [{ id: 'intro', actualSec: null, deltaSec: null }, { id: 'demo', actualSec: null, deltaSec: null }]);
});

const SCRIPT = readFileSync(join(FIXTURES, 'package', 'track1', 'day0', 'instructor_script.md'), 'utf8');
const EXPECTED = [
  { id: 'warm-up', title: 'Warm-up', plannedSec: 900, graded: false },
  { id: 'concept-walkthrough', title: 'Concept walkthrough', plannedSec: 3600, graded: false },
  { id: 'break', title: 'Break', plannedSec: 900, graded: false },
  { id: 'lab', title: 'Lab', plannedSec: 2700, graded: false },
  { id: 'quiz', title: 'Quiz', plannedSec: 900, graded: true },
];

test('AC-18 parseScriptSections on the fixture script returns the timed blocks and ignores untimed headings', () => {
  const parse = fn('parseScriptSections');
  assert.deepEqual(parse(SCRIPT), EXPECTED);
});

test('AC-18 em dash, en dash and hyphen ranges; bold break heading; [graded] marker removed', () => {
  const parse = fn('parseScriptSections');
  const md = [
    '# Script', '', '### Total runtime: **1 hours**', '',
    '## Opening (0:00 – 0:10)', 'text', '',
    '## Live demo (0:10 - 0:40)', '```bash', 'echo hi', '```', '',
    '## **Break (0:40 — 0:45)**', '',
    '## Notes', '',
    '## Check [graded] (0:45 — 1:00)', '',
  ].join('\n');
  assert.deepEqual(parse(md), [
    { id: 'opening', title: 'Opening', plannedSec: 600, graded: false },
    { id: 'live-demo', title: 'Live demo', plannedSec: 1800, graded: false },
    { id: 'break', title: 'Break', plannedSec: 300, graded: false },
    { id: 'check', title: 'Check', plannedSec: 900, graded: true },
  ]);
  assert.deepEqual(parse('# Nothing timed\n\n## Intro\n'), []);
});

test('AC-18 scriptTotalSec reads the Total runtime line (hours or minutes), null when absent', () => {
  const total = fn('scriptTotalSec');
  assert.equal(total(SCRIPT), 9000);
  assert.equal(total('# s\n\n### Total runtime: **90 minutes**\n'), 5400);
  assert.equal(total('# s\n\nTotal runtime: **2 hours**\n'), 7200);
  assert.equal(total('# s\n\n## Intro (0:00 — 0:10)\n'), null);
});
