// AC-88 Appeal (SPEC §6, §4.11, AC-73).
// data-testids used: app-ready*, appeal-open, appeal-evidence, score-history*
// Accessible names used: nav /grades|results|scores/ (learner), /appeals|inbox/ (trainer); field /reason/;
//   buttons /submit|send|appeal/, /uphold/, /confirm|save/; field /corrected score|new score/.
// Seed "appeal": l1's day-0 quiz scored 5/8 with seed "seed-c1-l1-day0-quiz", mode live, published day 0 13:00.
import { journey, see, tid, nav, click, clickIfPresent, fill, fillIfPresent, waitText, step, at, P } from './_harness.mjs';

journey({
  name: 'appeal', acs: ['AC-88'], title: 'learner appeals, trainer sees the evidence pack and upholds, learner sees corrected score with the original in history',
  seeds: ['base', 'appeal'], clock: at(1, '15:00'),
  async run(j) {
    const learner = await j.actor('learner', P.l1);
    await nav(learner, /^(grades|results|scores|my grades|my results)$/i, 'grades');
    await waitText(learner.locator('body'), /\b5\s*\/\s*8\b/, 'the published 5/8 score');
    await (await see(tid(learner, 'appeal-open'), 'appeal-open')).click();
    await fill(learner, /reason/i, 'Question 4 answer matches the key');
    await click(learner, /^(submit|send|appeal|submit appeal|send appeal)$/i, 'appeal submit');
    await waitText(learner.locator('body'), /appeal (is )?(open|sent|submitted)|open/i, 'the appeal being open');
    await step(learner, 'appeal opened');

    const trainer = await j.actor('trainer', P.trainer);
    await nav(trainer, /^(appeals|inbox|my inbox)$/i, 'trainer inbox');
    await clickIfPresent(trainer, /Lena Learner/i, 5000);
    const ev = await see(tid(trainer, 'appeal-evidence'), 'appeal-evidence', 30_000);
    const evText = await waitText(ev, /seed-c1-l1-day0-quiz/, 'the attempt seed in the evidence pack');
    for (const [re, what] of [[/\blive\b/i, 'mode'], [/unread/i, 'unread-confirmation count'], [/rubric|row/i, 'rubric rows']]) {
      if (!re.test(evText)) throw new Error(`appeal-evidence should show the ${what} (SPEC AC-73)`);
    }
    await step(trainer, 'evidence pack');
    await click(trainer, /^uphold$/i, 'uphold');
    await fillIfPresent(trainer, /corrected score|new score/i, '7');
    await clickIfPresent(trainer, /^(confirm|save|uphold)$/i, 3000);
    await waitText(trainer.locator('body'), /upheld/i, 'appeal upheld');

    await learner.reload();
    await see(learner.getByTestId('app-ready'), 'app shell');
    await nav(learner, /^(grades|results|scores|my grades|my results)$/i, 'grades');
    await waitText(learner.locator('body'), /\b7\s*\/\s*8\b/, 'the corrected score 7/8', 30_000);
    await waitText(await see(tid(learner, 'score-history'), 'score-history'), /\b5\s*\/\s*8\b/, 'the original 5/8 kept in history');
    await step(learner, 'corrected score');
  },
});
