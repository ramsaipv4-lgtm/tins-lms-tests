// AC-159 Voice notes (A-7), typed in tests (SPEC §6.3).
// data-testids used: app-ready*, roster-<personId>*, learner-notes*
// Accessible names used: trainer nav /notes|voice notes|class notes/; field /learner/ (choose Lena Learner);
//   field /note/; button /save|attach/; nav /roster|learners/; learner nav /profile|settings|my profile/.
import { journey, see, tid, nav, click, fill, waitText, step, at, P, assert } from './_harness.mjs';

const NOTE = 'Struggled with the clean command; pair with Liam tomorrow';

journey({
  name: 'trainer-notes', acs: ['AC-159'], title: "a note typed after class is attached to the chosen learner's profile and visible only to trainers",
  clock: at(0, '13:30'),
  async run(j) {
    const t = await j.actor('trainer', P.trainer);
    await nav(t, /^(notes|voice notes|class notes|add note)$/i, 'notes');
    await fill(t, /learner/i, 'Lena Learner');
    await fill(t, /^note$|your note|note text/i, NOTE);
    await click(t, /^(save|attach|save note)$/i, 'save note');
    await nav(t, /^(roster|learners|people)$/i, 'roster');
    await (await see(tid(t, 'roster-person:l1'), 'roster-person:l1')).click();
    await waitText(await see(tid(t, 'learner-notes'), 'learner-notes on the profile', 30_000), /clean command/, 'the note on Lena\'s profile');
    await step(t, 'note attached');

    const l1 = await j.actor('learner', P.l1);
    for (const re of [/^(profile|settings|my profile|account)$/i, /^(today|day 0|class|my class)$/i]) {
      await nav(l1, re, 'learner screen');
      assert.doesNotMatch(await l1.locator('body').innerText(), /clean command; pair with Liam/, 'trainer notes must not be visible to the learner');
    }
    const r = await fetch(`${j.url}/api/me/export`, { headers: { cookie: (await l1.context().cookies(j.url)).map((c) => `${c.name}=${c.value}`).join('; ') } });
    if (r.ok) assert.ok(!Buffer.from(await r.arrayBuffer()).toString('latin1').includes('pair with Liam'), "the learner's own export must not contain trainer notes");
    await step(l1, 'not visible to learner');
  },
});
