// AC-156 Coach space (§7.0, §7.2, F-05) (SPEC §6.3).
// data-testids used: app-ready*, coach-plan*, day-timeline*, section-<id>
// Accessible names used: nav /coach/; Coach PIN field /pin/ (+ /confirm pin/); button /accept defaults/;
//   nav /timeline|my day/; nav /today|day 0/.
// Counts every tap from opening the Coach conversation to the plan (PIN entry excluded): <= 25.
import { journey, see, tid, nav, control, waitText, until, step, at, P, unlockCoach, scriptSections, assert } from './_harness.mjs';

journey({
  name: 'coach', acs: ['AC-156'], title: 'coaching with "accept defaults" reaches a versioned plan in <= 25 taps; timeline shows study blocks and cards; PIN guards Coach only',
  seeds: ['base', 'cards'], clock: at(0, '07:30'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    await nav(page, /^(coach|my coach)$/i, 'Coach');
    assert.ok(await unlockCoach(page), 'the Coach space should ask for a PIN (or biometric) the first time (F-05)');
    const plan = tid(page, 'coach-plan');
    let taps = 0;
    await until(async () => {
      if (await plan.isVisible()) return true;
      const b = await control(page, /accept defaults|use defaults|^next$|^continue$/i, { roles: ['button'], timeout: 1500 });
      if (b) { await b.click(); taps++; }
      if (taps > 25) throw new Error(`more than 25 taps without reaching a plan (SPEC AC-156)`);
      return plan.isVisible();
    }, 'the coach plan via "accept defaults"', 60_000, 300);
    assert.ok(taps <= 25, `${taps} taps to a plan (max 25)`);
    await waitText(plan, /version 1|v1\b|version: 1/i, 'plan version 1');
    await step(page, `plan after ${taps} taps`);

    await nav(page, /^(timeline|my day|day timeline|today's plan)$/i, 'day timeline');
    const tl = await see(tid(page, 'day-timeline'), 'day-timeline');
    await waitText(tl, /9:00|09:00/, 'the class block from the schedule (09:00)');
    await waitText(tl, /cards? due|review cards/i, 'cards due on the timeline');
    await step(page, 'timeline');

    await page.reload(); await see(page.getByTestId('app-ready'), 'app shell');
    await j.clock(at(0, '09:05'));
    const [first] = scriptSections(0);
    await nav(page, /^(today|day 0|class|my class)$/i, 'course content');
    await see(tid(page, `section-${first.id}`), 'course content without a PIN');
    assert.equal(await page.getByLabel(/^(pin|enter pin)$/i).count(), 0, 'course content must never ask for the Coach PIN');
    await nav(page, /^(coach|my coach)$/i, 'Coach again');
    await see(page.getByLabel(/^(pin|enter pin|coach pin)$/i), 'the PIN prompt when re-entering Coach after a reload');
    await step(page, 'pin required for coach only');
  },
});
