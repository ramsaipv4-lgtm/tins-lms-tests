// AC-89 Wrap-up (A-1) (SPEC §6).
// data-testids used: app-ready*, wrap-up, attendance-input, cards-due-count*
// Accessible names used: nav /teleprompter|today|class/ (trainer); /today|day 0/ (learner) with links
//   /board.*pdf|board pdf/ and /quick.?learn/; nav /attendance|check in/; nav /reports?|delivery reports?/.
// After one tap: learners get the board PDF and quick-learn links and day-0 cards; attendance is closed;
// the trainer has a draft delivery report for day 0.
import { journey, see, tid, nav, clickIfPresent, waitText, until, step, at, P } from './_harness.mjs';

journey({
  name: 'wrapup', acs: ['AC-89'], title: 'one tap publishes board PDF, quick-learn and cards, closes attendance, drafts the delivery report',
  clock: at(0, '12:55'),
  async run(j) {
    const trainer = await j.actor('trainer', P.trainer);
    if (!(await tid(trainer, 'wrap-up').isVisible())) await nav(trainer, /^(teleprompter|today|class|day 0)$/i, 'trainer day screen');
    await (await see(tid(trainer, 'wrap-up'), 'wrap-up')).click();
    await clickIfPresent(trainer, /^(confirm|yes|wrap up|publish)$/i, 3000);
    await waitText(trainer.locator('body'), /wrapped up|published|done/i, 'wrap-up result');
    await step(trainer, 'wrapped up');

    const learner = await j.actor('learner', P.l1);
    await nav(learner, /^(today|day 0|class|my class)$/i, 'learner day page');
    await see(learner.getByRole('link', { name: /board.*pdf|board pdf|board notes/i }), 'board PDF link', 30_000);
    await see(learner.getByRole('link', { name: /quick.?learn/i }).or(learner.getByRole('button', { name: /quick.?learn/i })), 'quick-learn');
    await nav(learner, /^(cards|review|daily cards|review cards)$/i, 'cards');
    await until(async () => Number((/\d+/.exec(await tid(learner, 'cards-due-count').innerText()) || [0])[0]) >= 1, 'day-0 cards published to the learner');
    await nav(learner, /^(attendance|check in|mark attendance)$/i, 'attendance');
    await until(async () => (await tid(learner, 'attendance-input').isDisabled().catch(() => false)) || /closed/i.test(await learner.locator('body').innerText()), 'attendance closed');
    await step(learner, 'learner sees published material');

    await nav(trainer, /^(reports?|delivery reports?)$/i, 'reports');
    await waitText(trainer.locator('body'), /day 0[\s\S]{0,200}draft|draft[\s\S]{0,200}day 0/i, 'a draft delivery report for day 0');
    await step(trainer, 'draft report');
  },
});
