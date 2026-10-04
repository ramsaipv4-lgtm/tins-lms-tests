// AC-83 Teleprompter release (SPEC §6, D-38, AC-68).
// data-testids used: app-ready*, teleprompter, tp-next, tp-pace, section-<id> (rendered only once released)
// Accessible names used: nav /teleprompter/ (trainer), /today|day 0|class/ (learner).
// Section ids come from the fixture script (SPEC §4.8 slug rule): warm-up, concept-walkthrough, …
// At 09:01 on day 0 only the first section is released (by time); tp-next reaches the second section.
import { journey, see, notSee, tid, nav, waitText, step, at, P, scriptSections, assert } from './_harness.mjs';

journey({
  name: 'teleprompter', acs: ['AC-83'], title: 'trainer taps next; the learner sees the released section without reloading; pacing shows ahead/behind',
  clock: at(0, '09:01'),
  async run(j) {
    const [first, second] = scriptSections(0);
    const learner = await j.actor('learner', P.l1);
    await nav(learner, /^(today|day 0|class|my class)$/i, 'learner day page');
    await see(tid(learner, `section-${first.id}`), `section-${first.id} (released by time)`, 30_000);
    await notSee(tid(learner, `section-${second.id}`), `section-${second.id} before the trainer reaches it`);
    await learner.evaluate(() => { window.__noReload = 'still-here'; });
    await step(learner, 'before release');

    const trainer = await j.actor('trainer', P.trainer);
    await nav(trainer, /^teleprompter$/i, 'teleprompter');
    await see(tid(trainer, 'teleprompter'), 'teleprompter');
    await (await see(tid(trainer, 'tp-next'), 'tp-next')).click();
    await step(trainer, 'tapped next');
    await waitText(await see(tid(trainer, 'tp-pace'), 'tp-pace'), /ahead|behind|on time/i, 'the pacing bar');

    await see(tid(learner, `section-${second.id}`), `section-${second.id} after tp-next`, 30_000);
    assert.equal(await learner.evaluate(() => window.__noReload), 'still-here', 'the learner page must update without reloading');
    await step(learner, 'released without reload');
  },
});
