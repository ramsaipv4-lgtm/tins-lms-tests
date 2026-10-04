// AC-87 Sprint rituals: stand-up, estimation poker, retro (SPEC §6, §4.15, §4.16).
// data-testids used: app-ready*, poker-reveal, standup-summary*, poker-result*
// Accessible names used: nav /stand.?up/, /poker|estimat/, /retro/; fields /yesterday/, /today/, /blockers?/,
//   /retro item|went well|to improve|add item/; buttons with the card values "2", "3", "8" (exact names),
//   /submit|post|send/, /start|estimate/, /make (a )?ticket|create ticket|to ticket/; nav /tickets|board|backlog/.
// Votes {l1: 2, l2: 8, l3: 3} are a spread -> poker-result names Lena (low) and Liam (high) and asks them to explain.
import { journey, see, tid, nav, click, clickIfPresent, fill, waitText, step, at, P, NAMES, assert } from './_harness.mjs';

journey({
  name: 'rituals', acs: ['AC-87'], title: 'stand-up highlights blocked, poker reveals together and asks low/high voters on a spread, retro item becomes a ticket',
  clock: at(1, '09:10'),
  async run(j) {
    const l1 = await j.actor('l1', P.l1);
    await nav(l1, /^(stand.?up|daily stand.?up)$/i, 'stand-up');
    await fill(l1, /yesterday/i, 'Set up the Kettle site');
    await fill(l1, /^today|what will you do today/i, 'Add the about page');
    await fill(l1, /blockers?/i, "Waiting on Ravi's PR");
    await click(l1, /^(submit|post|send)$/i, 'stand-up submit');
    const trainer = await j.actor('trainer', P.trainer);
    await nav(trainer, /^(stand.?up|stand.?ups|daily stand.?up)$/i, 'stand-up summary');
    const summary = await see(tid(trainer, 'standup-summary'), 'standup-summary', 30_000);
    await waitText(summary, new RegExp(`${NAMES['person:l1']}[\\s\\S]*blocked|blocked[\\s\\S]*${NAMES['person:l1']}`, 'i'), 'Lena marked blocked in the summary');
    const highlighted = summary.locator('[data-blocked="true"], mark, .blocked, [aria-label*="blocked" i]');
    assert.ok(await highlighted.count() > 0, 'the blocked answer should be highlighted (data-blocked="true", <mark> or a "blocked" label)');
    await step(trainer, 'stand-up summary');

    await nav(trainer, /^(poker|estimation poker|estimate)$/i, 'poker');
    await clickIfPresent(trainer, /^(start|start round|estimate|new round)$/i, 3000);
    const voters = [[l1, '2'], [await j.actor('l2', P.l2), '8'], [await j.actor('l3', P.l3), '3']];
    for (const [page, card] of voters) {
      if (page !== l1) await see(page.getByTestId('app-ready'), 'app shell');
      await nav(page, /^(poker|estimation poker|estimate)$/i, 'poker (learner)');
      await (await see(page.getByRole('button', { name: card, exact: true }), `poker card ${card}`, 30_000)).click();
    }
    await step(l1, 'voted');
    await (await see(tid(trainer, 'poker-reveal'), 'poker-reveal')).click();
    const result = await see(tid(trainer, 'poker-result'), 'poker-result', 30_000);
    const text = await waitText(result, /explain/i, 'the spread asking low/high voters to explain');
    assert.match(text, new RegExp(NAMES['person:l1']), 'low voter named'); assert.match(text, new RegExp(NAMES['person:l2']), 'high voter named');
    await waitText(await see(tid(voters[2][0], 'poker-result'), 'poker-result on a voter screen', 30_000), /\b2\b[\s\S]*\b8\b|\b8\b[\s\S]*\b2\b/, 'all cards revealed together');
    await step(trainer, 'poker revealed');

    await nav(l1, /^(retro|retrospective)$/i, 'retro');
    await fill(l1, /retro item|went well|to improve|improve|add item/i, 'Flaky preview server on Mondays');
    await clickIfPresent(l1, /^(add|post|submit)$/i, 2000);
    await click(l1, /make (a )?ticket|create ticket|to ticket|turn into (a )?ticket/i, 'retro item -> ticket');
    await nav(l1, /^(tickets|board|backlog|sprint board)$/i, 'tickets');
    await see(l1.getByText('Flaky preview server on Mondays'), 'the new ticket from the retro item', 30_000);
    await step(l1, 'ticket created');
  },
});
