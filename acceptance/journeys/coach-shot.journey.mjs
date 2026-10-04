// AC-94 Coach screenshot import (P-16) (SPEC §6, §4.18, D-11).
// data-testids used: app-ready*, shot-upload, shot-confirm (the confirmation panel; it contains the fields
//   labelled /calories/ and /protein/ and a button /confirm|save/)
// Accessible names used: nav /coach/, /food|diet|import screenshot|screenshot/; Coach PIN field /pin/.
// Fixture: fixtures/journeys/diet-screenshot.png (rendered text "Calories 1,850", "Protein 72.5 g");
// seed "coach" has approved rules for it. OCR runs in the browser (tesseract.js, data from the hub).
// "Nothing is saved until confirmed" is checked on the hub: the number of documents in /db/person-l1 does
// not change while the values wait for confirmation, and grows by one after confirming.
import { join } from 'node:path';
import { journey, see, tid, nav, clickIfPresent, upload, until, step, at, P, JFIX, dbDocs, unlockCoach, wait, assert } from './_harness.mjs';

journey({
  name: 'coach-shot', acs: ['AC-94'], title: 'learner uploads the diet screenshot, confirms extracted calories 1850 and protein 72.5; nothing saved before confirming',
  seeds: ['base', 'coach'], clock: at(0, '20:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    await nav(page, /^(coach|my coach)$/i, 'Coach space');
    await unlockCoach(page);
    await clickIfPresent(page, /^(food|diet|import screenshot|screenshot|add from screenshot)$/i, 3000);
    const before = (await dbDocs(j, page, 'person-l1')).length;
    await upload(page, tid(page, 'shot-upload'), join(JFIX, 'diet-screenshot.png'), 'shot-upload');
    const panel = await see(tid(page, 'shot-confirm'), 'shot-confirm (OCR in the browser may take a while)', 60_000);
    await step(page, 'extracted');
    const cal = await panel.getByLabel(/calories/i).first().inputValue();
    const pro = await panel.getByLabel(/protein/i).first().inputValue();
    assert.equal(Number(cal.replace(/,/g, '')), 1850, `calories extracted as ${cal}`);
    assert.equal(Number(pro), 72.5, `protein extracted as ${pro}`);
    await wait(2000);
    assert.equal((await dbDocs(j, page, 'person-l1')).length, before, 'no document may be saved before the learner confirms');
    await panel.getByRole('button', { name: /^(confirm|save|confirm and save)$/i }).click();
    await until(async () => (await dbDocs(j, page, 'person-l1')).length === before + 1, 'one new (encrypted) coach entry on the hub after confirming', 30_000);
    await step(page, 'confirmed');
  },
});
