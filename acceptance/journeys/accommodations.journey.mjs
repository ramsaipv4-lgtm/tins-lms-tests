// AC-153 Accommodations (F-09) (SPEC §6.3, §4.26).
// data-testids used: app-ready*, shift-timer*
// Accessible names used: learner nav /settings|profile|accommodations?/; button /request (an )?accommodation/;
//   field /extra time|time multiplier/ (1.5); field /reason/; button /submit|send|request/;
//   admin nav /accommodations?|requests/; button /approve/; learner nav /shift/.
// Fixture Shift is 60 min, so with 1.5x the timer shows a 90-minute limit ("90 min" or "1:30:00"/"1:30").
import { journey, see, tid, nav, click, fill, waitText, step, at, P, shiftPack } from './_harness.mjs';

journey({
  name: 'accommodations', acs: ['AC-153'], title: 'learner requests extra time, admin approves, the Shift timer shows the extended limit',
  clock: at(0, '15:00'),
  async run(j) {
    const minutes = shiftPack().durationMin * 1.5;
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(settings|profile|accommodations?|my profile)$/i, 'learner settings');
    await click(l1, /request (an )?accommodation/i, 'request accommodation');
    await fill(l1, /extra time|time multiplier/i, '1.5');
    await fill(l1, /reason/i, 'Documented need for extra time', { required: false });
    await click(l1, /^(submit|send|request)$/i, 'submit request');
    await step(l1, 'requested');

    const admin = await j.actor('admin', P.admin);
    await nav(admin, /^(accommodations?|requests|accommodation requests)$/i, 'admin accommodations');
    await see(admin.getByText(/Lena Learner/), 'the request from Lena', 30_000);
    await click(admin, /^approve$/i, 'approve');
    await waitText(admin.locator('body'), /approved/i, 'approved');
    await step(admin, 'approved');

    await l1.reload(); await see(l1.getByTestId('app-ready'), 'app shell');
    await nav(l1, /^(shift|the shift)$/i, 'Shift');
    const h = Math.floor(minutes / 60); const m = String(minutes % 60).padStart(2, '0');
    await waitText(await see(tid(l1, 'shift-timer'), 'shift-timer', 30_000), new RegExp(`\\b${minutes}\\s*min|\\b${h}:${m}(:00)?\\b`), `the ${minutes}-minute extended limit`);
    await step(l1, 'extended timer');
  },
});
