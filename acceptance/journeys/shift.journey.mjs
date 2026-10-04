// AC-86 Shift (SPEC §6, §4.10).
// data-testids used: app-ready*, shift-start, sla-<ticketId>, shift-score, score-row-<rubricRowId>*
// Accessible names used: nav /shift/; inside sla-<id>: buttons /acknowledge|ack/, /resolve/, field /answer|resolution/;
//   button /end shift|finish shift|submit shift/.
// Time travel: j.clock() sets the server clock (/__test/clock) and the page clock (Playwright clock) together.
// Fixture pack shift-pack-1: T1 at 0 min (answer "missing build step"), T2 at 5 min, T3 at 20 min, T4 at 30 min.
import { journey, see, notSee, tid, nav, click, clickIfPresent, waitText, step, at, P, shiftPack, assert } from './_harness.mjs';

journey({
  name: 'shift', acs: ['AC-86'], title: 'team starts the Shift, tickets arrive over test-clock time, ack+resolve updates the SLA board, score shows mode and rubric rows',
  clock: at(1, '10:00'),
  async run(j) {
    const pack = shiftPack();
    const t1 = pack.tickets.find((t) => t.arrivesAtMin === 0);
    const later = pack.tickets.find((t) => t.arrivesAtMin > 0);
    const page = await j.actor('learner', P.l1, { fakeClock: at(1, '10:00') });
    await nav(page, /^(shift|the shift|start shift)$/i, 'Shift screen');
    await (await see(tid(page, 'shift-start'), 'shift-start', 30_000)).click();
    const startedAt = at(1, '10:00');
    const card1 = await see(tid(page, `sla-${t1.id}`), `sla-${t1.id} (arrives at 0 min)`, 30_000);
    await notSee(tid(page, `sla-${later.id}`), `sla-${later.id} before ${later.arrivesAtMin} min`);
    await step(page, 'shift started');

    await j.clock(startedAt + (later.arrivesAtMin + 1) * 60_000);
    await see(tid(page, `sla-${later.id}`), `sla-${later.id} after ${later.arrivesAtMin + 1} test-clock minutes`, 30_000);
    await step(page, 'later ticket arrived');

    await card1.getByRole('button', { name: /^(acknowledge|ack)$/i }).click();
    await waitText(tid(page, `sla-${t1.id}`), /acked|acknowledged/i, `sla-${t1.id} acknowledged`);
    await card1.getByRole('button', { name: /^resolve$/i }).click();
    const answerField = card1.getByLabel(/answer|resolution/i).or(page.getByRole('dialog').getByLabel(/answer|resolution/i));
    await answerField.first().fill(t1.check.expected);
    await clickIfPresent(page, /^(submit|resolve|confirm|save)$/i, 3000);
    await waitText(tid(page, `sla-${t1.id}`), /resolved/i, `sla-${t1.id} resolved`);
    await step(page, 'ticket resolved');

    await click(page, /^(end shift|finish shift|submit shift|finish)$/i, 'end shift button');
    await clickIfPresent(page, /^(confirm|yes|end)$/i, 2000);
    const score = await see(tid(page, 'shift-score'), 'shift-score', 30_000);
    await waitText(score, /\blive\b/i, 'the mode (live) on the score screen');
    for (const row of pack.rubric[0].rows) await see(score.getByTestId(`score-row-${row.id}`), `score-row-${row.id}`);
    assert.equal(await score.locator('[data-testid^="score-row-"]').count(), pack.rubric[0].rows.length, 'one row per rubric row of the live mode');
    await step(page, 'score');
  },
});
