// AC-150 Substitute (F-01) and AC-151 AI-delivered session with AI off (SPEC §6.3).
// data-testids used: app-ready*, handover-pack*, self-learn*, wrap-up, teleprompter
// Accessible names used: trainer button /can.?t take day 1|cannot take day 1/; field /substitute/ (select, combobox
//   or radio) with option "Sam Substitute"; option /self.?learn( mode)?/; buttons /confirm|save|send/;
//   substitute nav /handover/, button /mark (as )?read/; nav /teleprompter/; trainer nav /reports?|delivery reports?/;
//   learner nav /today|day 1/; self-learn button /next( section)?/; field /question|ask/; button /ask|send|submit/.
// AC-151 is checked with AI off (the suite has no AI); the AI-on behaviour (answering, running the quiz) needs
// a fake AI provider (SPEC gap G-9).
import { journey, see, tid, nav, click, clickIfPresent, fill, waitText, step, at, P, scriptSections } from './_harness.mjs';

async function cantTake(trainer) {
  await nav(trainer, /^(schedule|days|class|my classes|class schedule)$/i, 'class schedule');
  await click(trainer, /can.?t take day 1|cannot take day 1/i, '"I can\'t take day 1"');
}

journey({
  name: 'substitute', acs: ['AC-150'], title: 'trainer hands day 1 to a substitute, who reads the handover pack; the report records who taught',
  clock: at(0, '15:00'),
  async run(j) {
    const trainer = await j.actor('trainer', P.trainer);
    await cantTake(trainer);
    await fill(trainer, /substitute/i, 'Sam Substitute', { required: false }) || await click(trainer, /Sam Substitute/i, 'substitute choice');
    await click(trainer, /^(confirm|save|send|hand over)$/i, 'confirm substitute');
    await step(trainer, 'substitute chosen');

    const sub = await j.actor('substitute', P.sub);
    await nav(sub, /^(handover|handover pack)$/i, 'handover');
    const pack = await see(tid(sub, 'handover-pack'), 'handover-pack', 30_000);
    const text = await pack.innerText();
    for (const [re, what] of [[/script/i, 'script'], [/board/i, 'board pages'], [/quick.?learn/i, 'quick-learn'], [/status/i, 'class status'], [/at.?risk/i, 'at-risk list'], [/notes/i, 'trainer notes']]) {
      if (!re.test(text)) throw new Error(`handover-pack should include the ${what} (SPEC AC-150)`);
    }
    await click(sub, /mark (as )?read/i, 'mark read');
    await waitText(pack, /\bread\b/i, 'handover marked read');
    await step(sub, 'handover read');

    await j.clock(at(1, '12:55'));
    await nav(sub, /^(teleprompter|today|day 1)$/i, 'substitute day screen');
    await (await see(tid(sub, 'wrap-up'), 'wrap-up for the substitute')).click();
    await clickIfPresent(sub, /^(confirm|yes|wrap up|publish)$/i, 3000);
    await nav(trainer, /^(reports?|delivery reports?)$/i, 'reports');
    await waitText(trainer.locator('body'), /day 1[\s\S]{0,300}Sam Substitute|Sam Substitute[\s\S]{0,300}day 1/i, 'the day 1 report naming Sam Substitute', 30_000);
    await step(trainer, 'report records substitute');
  },
});

journey({
  name: 'self-learn', acs: ['AC-151'], title: 'with no substitute and AI off, self-learn mode plays the script as text, queues questions, report marks AI-delivered',
  clock: at(0, '15:00'),
  async run(j) {
    const [s1, s2] = scriptSections(1);
    const trainer = await j.actor('trainer', P.trainer);
    await cantTake(trainer);
    await click(trainer, /self.?learn( mode)?/i, 'self-learn mode');
    await clickIfPresent(trainer, /^(confirm|save|send)$/i, 3000);
    await step(trainer, 'self-learn chosen');

    await j.clock(at(1, '09:05'));
    const learner = await j.actor('learner', P.l1);
    await nav(learner, /^(today|day 1|class|my class)$/i, 'day 1');
    const player = await see(tid(learner, 'self-learn'), 'self-learn player', 30_000);
    await waitText(player, new RegExp(s1.title, 'i'), `first script section "${s1.title}"`);
    await player.getByRole('button', { name: /^next( section)?$/i }).click();
    await waitText(player, new RegExp(s2.title, 'i'), `second script section "${s2.title}"`);
    await fill(learner, /question|ask/i, 'Does kettle build work offline?');
    await click(learner, /^(ask|send|submit)$/i, 'ask question');
    await waitText(learner.locator('body'), /queued|trainer will answer|saved for (the )?trainer/i, 'question queued, not answered (AI off)');
    await step(learner, 'question queued');

    await j.clock(at(1, '13:30'));
    await nav(trainer, /^(reports?|delivery reports?)$/i, 'reports');
    await waitText(trainer.locator('body'), /AI-delivered/, 'day 1 report marked AI-delivered', 30_000);
    await step(trainer, 'report AI-delivered');
  },
});
