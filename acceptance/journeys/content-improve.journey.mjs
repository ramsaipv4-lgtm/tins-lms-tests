// AC-166 Content improvement (E-1, E-2, E-4) (SPEC §6.3, §4.21).
// data-testids used: app-ready*, item-analysis*, item-row-<itemId>* (data-flag="true" when flagged),
//   misconception-suggestions* (each suggestion a role=listitem with buttons /accept/, /edit/, /reject/),
//   package-diff*
// Accessible names used: trainer nav /item analysis|question quality|analytics/, /misconceptions/ (optional);
//   upload field labelled /package/ on nav /library|packages/.
// Seed "items": item day0:diag:8 answered correctly by all 12 learners (p > 0.95 -> flagged); on item 4 the wrong
// answer "kettle make" repeats. The changed package is the fixture with day 1's diagnostic question 1 reworded.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { journey, see, tid, nav, upload, waitText, until, step, at, P, packageCopy, packageTar, assert } from './_harness.mjs';

journey({
  name: 'content-improve', acs: ['AC-166'], title: 'item analysis flags weak questions; wrong answers become misconception suggestions; a changed syllabus shows which days and questions change',
  seeds: ['base', 'items'], clock: at(1, '08:00'),
  async run(j) {
    const t = await j.actor('trainer', P.trainer);
    await nav(t, /^(item analysis|question quality|analytics)$/i, 'item analysis');
    const ia = await see(tid(t, 'item-analysis'), 'item-analysis', 30_000);
    const row8 = await see(ia.getByTestId('item-row-day0:diag:8'), 'item-row-day0:diag:8');
    assert.equal(await row8.getAttribute('data-flag'), 'true', 'the planted item (everyone correct) is flagged');
    await step(t, 'item analysis');

    if (!(await tid(t, 'misconception-suggestions').isVisible())) await nav(t, /^(misconceptions|suggested misconceptions)$/i, 'misconceptions');
    const ms = await see(tid(t, 'misconception-suggestions'), 'misconception-suggestions');
    const sug = ms.getByRole('listitem').filter({ hasText: /kettle make/i });
    await see(sug, 'a suggestion built from the repeated wrong answer "kettle make"');
    for (const b of [/^accept$/i, /^edit$/i, /^reject$/i]) await see(sug.getByRole('button', { name: b }), `suggestion button ${b}`);
    await sug.getByRole('button', { name: /^accept$/i }).click();
    await waitText(ms, /accepted/i, 'the suggestion accepted');
    await step(t, 'misconception accepted');

    const copy = packageCopy();
    const ql = join(copy, 'track1', 'day1', 'quicklearn.md');
    const lines = readFileSync(ql, 'utf8').split('\n');
    const qi = lines.findIndex((l, i) => /^1\.\s/.test(l) && lines.slice(0, i).some((x) => /diagnostic/i.test(x)));
    lines[qi] = '1. Which command starts the Kettle preview server (reworded)?';
    writeFileSync(ql, lines.join('\n'));
    await nav(t, /^(library|package library|packages)$/i, 'library');
    await upload(t, t.getByLabel(/package/i), packageTar(copy), 'package upload');
    const diff = await see(tid(t, 'package-diff'), 'package-diff', 60_000);
    const text = await until(async () => { const x = await diff.innerText(); return /day\s*1/i.test(x) && /question\s*1|Q1|reworded/i.test(x) ? x : null; }, 'the diff naming day 1 and its question 1');
    assert.doesNotMatch(text, /day\s*2[\s\S]{0,40}changed/i, 'day 2 is not reported as changed');
    await step(t, 'package diff');
  },
});
