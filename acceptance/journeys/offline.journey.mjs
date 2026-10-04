// AC-95 Phone-only use after the first load (SPEC §6, D-5 installable offline app, D-6 sync).
// data-testids used: app-ready*, section-<id>, card-show, rate-good, cards-due-count*, diag-q-<n>*, mastery-map*
// Accessible names used: nav /today|day 0/, /cards|review/, /diagnostic|quick.?learn|quiz/, /mastery|progress/;
//   buttons /start|take (the )?diagnostic/, /submit|check|finish/.
// Steps: first load online (service worker installs) -> server stopped -> reload works from the service worker ->
// released content, a card review, the diagnostic and the mastery map all work -> server restarted on the
// same port and data dir -> the card review reaches the hub (card with reps >= 1 in /db/person-l1).
import { journey, see, tid, nav, clickIfPresent, waitText, until, step, at, P, scriptSections, answerDiagnostic, dbDocs } from './_harness.mjs';

const due = async (page) => Number((/\d+/.exec(await tid(page, 'cards-due-count').innerText()) || [NaN])[0]);

journey({
  name: 'offline', acs: ['AC-95'], title: 'with the server stopped the learner opens released content, reviews cards, takes the diagnostic, sees mastery; changes sync on reconnect',
  seeds: ['base', 'cards'], clock: at(0, '11:00'),
  async run(j) {
    const [first] = scriptSections(0);
    const page = await j.actor('learner', P.l1);
    await nav(page, /^(today|day 0|class|my class)$/i, 'day page');
    await see(tid(page, `section-${first.id}`), `section-${first.id}`, 30_000);
    await nav(page, /^(cards|review|daily cards|review cards)$/i, 'cards');
    await see(tid(page, 'cards-due-count'), 'cards-due-count');
    await until(() => page.evaluate(() => !!navigator.serviceWorker?.controller || Promise.race([navigator.serviceWorker?.ready.then(() => !!navigator.serviceWorker.controller), new Promise((r) => setTimeout(() => r(false), 1000))])), 'a service worker controlling the page (D-5)', 30_000);
    await step(page, 'first load online');

    await j.stopServer();
    await page.reload();
    await see(tid(page, 'app-ready'), 'the app shell from the service worker with the server stopped', 30_000);
    await nav(page, /^(today|day 0|class|my class)$/i, 'day page offline');
    await see(tid(page, `section-${first.id}`), `released section-${first.id} offline`);
    await step(page, 'content offline');

    await nav(page, /^(cards|review|daily cards|review cards)$/i, 'cards offline');
    const n = await until(async () => { const v = await due(page); return v >= 1 ? v : 0; }, 'due cards offline');
    await (await see(tid(page, 'card-show'), 'card-show')).click();
    await (await see(tid(page, 'rate-good'), 'rate-good')).click();
    await until(async () => (await due(page)) === n - 1, 'due count drop offline');

    await nav(page, /^(diagnostic|quick.?learn|quiz|day 0 diagnostic)$/i, 'diagnostic offline');
    await clickIfPresent(page, /^(start|take)( the)?( diagnostic| quiz)?$/i, 3000);
    await answerDiagnostic(page, 0, 8);
    await waitText(page.locator('body'), /\b8\s*\/\s*8\b/, 'diagnostic score 8/8 offline');
    await nav(page, /^(mastery|mastery map|progress|my progress)$/i, 'mastery map offline');
    await see(tid(page, 'mastery-map'), 'mastery-map offline');
    await step(page, 'all offline');

    await j.restartServer();
    await j.relogin(page, P.l1);
    await until(async () => (await dbDocs(j, page, 'person-l1')).some((d) => d.type === 'card' && ((d.fsrs?.reps ?? d.reps ?? 0) >= 1)), 'the offline card review synced to the hub', 45_000, 1000);
    await step(page, 'synced');
  },
});
