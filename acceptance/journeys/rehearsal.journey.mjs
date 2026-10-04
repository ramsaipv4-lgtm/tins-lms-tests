// AC-158 Rehearsal (A-9, A-10, E-3) (SPEC §6.3, §4.8).
// data-testids used: app-ready*, teleprompter, tp-next, tp-pace, rehearsal-report*
// Accessible names used: nav /rehears/; buttons /start rehearsal|rehearse/, /end|finish( rehearsal)?/;
//   self-check list = checkboxes under a heading /self.?check/; text /freshness/ with a result /ok|pass|stale|fail|not checked/.
// Time moves with the Playwright page clock (fastForward) so the actual section times differ from plan.
import { journey, see, tid, nav, click, waitText, step, at, P, scriptSections, assert } from './_harness.mjs';

journey({
  name: 'rehearsal', acs: ['AC-158'], title: 'rehearsal runs the teleprompter with pacing, then planned vs actual per section, self-check (AI off) and lab-command freshness',
  clock: at(0, '07:00'),
  async run(j) {
    const sections = scriptSections(0);
    const t = await j.actor('trainer', P.trainer, { fakeClock: at(0, '07:00') });
    await nav(t, /^(rehearse|rehearsal|rehearsal mode)$/i, 'rehearsal');
    await click(t, /start rehearsal|^rehearse$|^start$/i, 'start rehearsal');
    await see(tid(t, 'teleprompter'), 'teleprompter in rehearsal');
    await t.clock.fastForward(20 * 60_000); // first section planned 15 min
    await (await see(tid(t, 'tp-next'), 'tp-next')).click();
    await waitText(await see(tid(t, 'tp-pace'), 'tp-pace'), /behind|ahead|on time/i, 'pacing during rehearsal');
    await t.clock.fastForward(10 * 60_000);
    await (await see(tid(t, 'tp-next'), 'tp-next')).click();
    await step(t, 'rehearsing');
    await click(t, /^(end|finish|end rehearsal|finish rehearsal)$/i, 'end rehearsal');
    const rep = await see(tid(t, 'rehearsal-report'), 'rehearsal-report', 30_000);
    const text = await rep.innerText();
    for (const s of sections.slice(0, 2)) assert.match(text, new RegExp(s.title, 'i'), `planned vs actual row for "${s.title}"`);
    assert.match(text, /planned/i); assert.match(text, /actual/i);
    await see(t.getByText(/self.?check/i), 'self-check list (AI off)');
    assert.ok(await t.getByRole('checkbox').count() >= 1, 'self-check items are checkboxes');
    await waitText(t.locator('body'), /freshness[\s\S]{0,200}(ok|pass|stale|fail|not checked)/i, 'freshness check result for the lab commands');
    await step(t, 'rehearsal report');
  },
});
