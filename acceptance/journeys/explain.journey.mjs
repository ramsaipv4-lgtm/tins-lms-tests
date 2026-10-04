// AC-93 Explain-it-back (B-3) with AI off (SPEC §6, §4.17).
// data-testids used: app-ready*, explain-covered*, explain-missing*, explain-misconceptions*
// Accessible names used: nav /explain/; field /explanation|explain/; button /check|submit/.
// Seed "explain": day-0 checklist with concepts "Build output folder" (public folder | build output),
// "Themes apply templates" (theme | template) and misconception "The build edits page sources"
// (changes the pages folder | edits the sources). AI is off by default (switch explainBackAi off).
import { journey, see, tid, nav, click, fill, waitText, step, at, P } from './_harness.mjs';

journey({
  name: 'explain', acs: ['AC-93'], title: 'learner types an explanation (AI off) and sees covered, missing and misconception feedback from the offline checklist',
  seeds: ['base', 'explain'], clock: at(0, '12:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    await nav(page, /^(explain.?it.?back|explain)$/i, 'explain-it-back');
    await fill(page, /explanation|explain/i, 'Kettle build reads each page and writes HTML into the public folder. It also changes the pages folder.');
    await click(page, /^(check|submit|check my explanation)$/i, 'check explanation');
    await waitText(await see(tid(page, 'explain-covered'), 'explain-covered', 30_000), /build output/i, 'covered: Build output folder');
    await waitText(await see(tid(page, 'explain-missing'), 'explain-missing'), /theme/i, 'missing: Themes apply templates');
    await waitText(await see(tid(page, 'explain-misconceptions'), 'explain-misconceptions'), /edits page sources|build edits/i, 'misconception reported');
    await step(page, 'feedback');
  },
});
