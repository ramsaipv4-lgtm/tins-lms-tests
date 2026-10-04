// AC-84 Catch-up gate for a learner who joined on day 3 (SPEC §6, §4.3).
// data-testids used: app-ready*, gate-day-<n>, diag-q-<1..8>* (one per diagnostic question, display order)
// Accessible names used: nav /catch.?up|today|my days/; buttons /start|take (the )?diagnostic/,
//   /submit|check|finish/, /retry|try again/. Scores shown as "5/8" / "6/8".
// The diagnostic is the fixture day-0 quick-learn's 8 questions (free-text answers, matched by text).
import { journey, see, notSee, tid, nav, clickIfPresent, waitText, step, at, P, answerDiagnostic } from './_harness.mjs';

journey({
  name: 'catchup', acs: ['AC-84'], title: 'late joiner fails day 0 gate with 5/8, passes with 6/8, day 1 gate appears',
  seeds: ['base', 'late-joiner'], clock: at(3, '09:30'),
  async run(j) {
    const page = await j.actor('late-joiner', P.l4);
    await nav(page, /^(catch.?up|today|my days|days)$/i, 'catch-up screen');
    const gate0 = await see(tid(page, 'gate-day-0'), 'gate-day-0', 30_000);
    await notSee(tid(page, 'gate-day-1'), 'gate-day-1 before day 0 is passed', 500);
    await step(page, 'day 0 gate');

    await gate0.click();
    await clickIfPresent(page, /^(start|take)( the)?( diagnostic| quiz)?$/i, 3000);
    await answerDiagnostic(page, 0, 5);
    await waitText(page.locator('body'), /\b5\s*\/\s*8\b/, 'score 5/8');
    await step(page, 'failed 5 of 8');
    await notSee(tid(page, 'gate-day-1'), 'gate-day-1 after failing with 5/8', 500);

    await clickIfPresent(page, /^(retry|try again|retake)$/i, 5000) || await (await see(tid(page, 'gate-day-0'), 'gate-day-0 after failing')).click();
    await clickIfPresent(page, /^(start|take)( the)?( diagnostic| quiz)?$/i, 3000);
    await answerDiagnostic(page, 0, 6);
    await waitText(page.locator('body'), /\b6\s*\/\s*8\b/, 'score 6/8');
    await clickIfPresent(page, /^(continue|back|done)$/i, 2000);
    await see(tid(page, 'gate-day-1'), 'gate-day-1 after passing day 0', 30_000);
    await step(page, 'day 1 gate');
  },
});
