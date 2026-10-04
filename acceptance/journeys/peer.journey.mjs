// AC-161 Peer review and pair programming (B-5, B-4) (SPEC §6.3, §4.27 pairProgramming).
// data-testids used: app-ready*, review-checklist*, review-score*, pair-timer*
// Accessible names used: learner nav /reviews?|peer review/; checklist items are checkboxes; field /comment/;
//   button /submit( review)?/; trainer nav /settings|switches|class settings/, checkbox /pair programming/;
//   learner nav /lab/.
// Seed "peer": l1 reviews l2's PR "Add an about page" with 3 checklist items. Teams: team-a = l1 + l2.
import { journey, see, tid, nav, click, clickIfPresent, fill, waitText, step, at, P } from './_harness.mjs';

journey({
  name: 'peer-review', acs: ['AC-161'], title: "learner reviews a classmate's PR with a checklist and the review is scored",
  seeds: ['base', 'peer'], clock: at(1, '14:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(reviews?|peer review|my reviews)$/i, 'reviews');
    await clickIfPresent(l1, /Add an about page/i, 3000);
    const list = await see(tid(l1, 'review-checklist'), 'review-checklist', 30_000);
    const boxes = list.getByRole('checkbox');
    for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
    await fill(l1, /comment/i, 'Builds fine; please rename page2.md to about.md.');
    await click(l1, /^submit( review)?$/i, 'submit review');
    await waitText(await see(tid(l1, 'review-score'), 'review-score', 30_000), /\d/, 'a score for the review');
    await step(l1, 'review scored');
  },
});

journey({
  name: 'pair-programming', acs: ['AC-161'], title: 'with pairProgramming on, a lab shows paired names and a 15-minute swap timer',
  clock: at(1, '10:45'),
  async run(j) {
    const t = await j.actor('trainer', P.trainer);
    await nav(t, /^(settings|switches|class settings|features)$/i, 'class switches');
    await t.getByRole('checkbox', { name: /pair programming/i }).or(t.getByRole('switch', { name: /pair programming/i })).first().check();
    await clickIfPresent(t, /^(save|apply)$/i, 2000);
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(lab|labs|today's lab)$/i, 'lab');
    await waitText(l1.locator('body'), /Liam Learner|Mira Learner/, 'the paired partner name', 30_000);
    await waitText(await see(tid(l1, 'pair-timer'), 'pair-timer'), /\b1[45]:\d\d\b/, 'a 15-minute swap timer');
    await step(l1, 'paired lab');
  },
});
