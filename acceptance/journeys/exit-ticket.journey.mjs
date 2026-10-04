// AC-92 Exit ticket (B-1) (SPEC §6, §4.19).
// data-testids used: app-ready*, exit-tally* (each choice is a role=listitem with its count)
// Accessible names used: nav /exit ticket/; pre-generated choices are checkboxes; field /anything else|comment|in your words/;
//   button /submit|send/.
import { journey, see, tid, nav, click, fill, until, step, at, P, assert, escapeRe } from './_harness.mjs';

async function answer(page, picks, text) {
  await nav(page, /^(exit ticket|today's exit ticket)$/i, 'exit ticket');
  const boxes = page.getByRole('checkbox');
  await until(async () => (await boxes.count()) >= 2, 'at least two pre-generated choices');
  const labels = [];
  for (const i of picks) { await boxes.nth(i).check(); labels.push((await boxes.nth(i).evaluate((e) => e.labels?.[0]?.innerText || e.getAttribute('aria-label') || '')).trim()); }
  if (text) await fill(page, /anything else|comment|in your words|text/i, text);
  await click(page, /^(submit|send)$/i, 'exit ticket submit');
  return labels;
}

journey({
  name: 'exit-ticket', acs: ['AC-92'], title: 'learners pick pre-generated choices and type text; the trainer sees the tally for the day',
  clock: at(0, '12:50'),
  async run(j) {
    const l1 = await j.actor('l1', P.l1);
    const [c0, c1] = await answer(l1, [0, 1], 'Still unsure about the clean command');
    await step(l1, 'submitted');
    const l2 = await j.actor('l2', P.l2);
    await answer(l2, [0], null);
    const trainer = await j.actor('trainer', P.trainer);
    await nav(trainer, /^(exit tickets?|tally)$/i, 'exit ticket tally');
    const tally = await see(tid(trainer, 'exit-tally'), 'exit-tally', 30_000);
    const countOf = async (label) => { const t = await tally.getByRole('listitem').filter({ hasText: label }).first().innerText(); return Number((/(\d+)\s*$/.exec(t.trim()) || /\b(\d+)\b/.exec(t.replace(label, '')) || [])[1]); };
    await until(async () => (await countOf(c0)) === 2 && (await countOf(c1)) === 1, `tally "${c0}" = 2 and "${c1}" = 1`);
    const items = await tally.getByRole('listitem').allInnerTexts();
    assert.ok(new RegExp(escapeRe(c0)).test(items[0]), 'most-picked choice first');
    await step(trainer, 'tally');
  },
});
