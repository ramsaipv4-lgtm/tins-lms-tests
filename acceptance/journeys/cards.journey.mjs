// AC-85 Daily cards and error notebook (SPEC §6, §4.2).
// data-testids used: app-ready*, card-show, rate-good, cards-due-count* (text contains the number due),
//   error-notebook
// Accessible names used: nav /cards|review|daily cards/, /error notebook|mistakes|my mistakes/.
// Seed "cards": l1 has 3 due cards and day-0 error notes under subtopics "Commands" and "Folders".
import { journey, see, tid, nav, waitText, until, step, at, P, assert } from './_harness.mjs';

const dueOf = async (page) => Number((/\d+/.exec(await tid(page, 'cards-due-count').innerText()) || [NaN])[0]);

journey({
  name: 'cards', acs: ['AC-85'], title: 'learner reviews a due card, the due count drops, the error notebook lists wrong answers by subtopic',
  seeds: ['base', 'cards'], clock: at(0, '18:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    await nav(page, /^(cards|review|daily cards|review cards)$/i, 'cards screen');
    await see(tid(page, 'cards-due-count'), 'cards-due-count', 30_000);
    const before = await until(async () => { const n = await dueOf(page); return n >= 1 ? n : 0; }, 'a due count of at least 1');
    await step(page, `due ${before}`);
    await (await see(tid(page, 'card-show'), 'card-show')).click();
    await step(page, 'answer shown');
    await (await see(tid(page, 'rate-good'), 'rate-good')).click();
    const after = await until(async () => { const n = await dueOf(page); return n === before - 1 ? String(n) : null; }, `due count to drop from ${before} to ${before - 1}`);
    assert.equal(Number(after), before - 1);
    await step(page, 'due count dropped');

    await nav(page, /^(error notebook|mistakes|my mistakes|notebook)$/i, 'error notebook');
    const nb = await see(tid(page, 'error-notebook'), 'error-notebook');
    const text = await waitText(nb, /Commands[\s\S]*Folders|Folders[\s\S]*Commands/i, 'subtopics Commands and Folders');
    assert.match(text, /removes old build output/i, 'the wrong-answer question is listed');
    await step(page, 'error notebook');
  },
});
