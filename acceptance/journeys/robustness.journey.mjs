// AC-167 Robustness (F-1, F-2, F-3) (SPEC §6.3).
// data-testids used: app-ready*, fire-drill*, data-meter*, cards-due-count*, card-show
// Accessible names used: trainer nav /fire drill/, buttons /start( fire)? drill/, /next|continue/; result /passed|complete/;
//   learner nav /settings/, checkbox /kiosk( mode)?/, checkbox /wi-?fi only downloads/; nav /coach/ must be absent in kiosk;
//   kiosk sign-out after 30 min idle shows /sign in|signed out/; data meter text like "12 KB" / "1.2 MB";
//   a download on a cellular connection (CDP connectionType cellular3g) is held with a /wi-?fi/ message.
// The fire drill stops the hub's service from inside the app (the wizard), not the test process.
import { journey, see, tid, nav, click, clickIfPresent, control, waitText, until, step, at, P, cdpFor, assert } from './_harness.mjs';

journey({
  name: 'fire-drill', acs: ['AC-167'], title: 'fire-drill wizard stops the hub mid-rehearsal; phones keep working and catch up', seeds: ['base', 'cards'], clock: at(0, '07:30'),
  async run(j) {
    const t = await j.actor('trainer', P.trainer);
    const l1 = await j.actor('learner', P.l1);
    await nav(t, /^(fire drill|fire-drill)$/i, 'fire drill');
    await click(t, /start( fire)? drill/i, 'start drill');
    const fd = await see(tid(t, 'fire-drill'), 'fire-drill wizard');
    await waitText(fd, /hub (is )?(stopped|down|offline)/i, 'hub stopped by the drill', 30_000);
    await nav(l1, /^(cards|review|daily cards|review cards)$/i, 'learner cards during the drill');
    await (await see(tid(l1, 'card-show'), 'card-show while the hub is down')).click();
    await step(l1, 'phone works during drill');
    await until(async () => { await clickIfPresent(t, /^(next|continue|restart hub|resume)$/i, 1000); return /passed|complete/i.test(await fd.innerText()); }, 'the drill to complete', 45_000, 1000);
    assert.match(await fd.innerText(), /caught up|synced|catch up/i, 'the wizard confirms phones caught up');
    await step(t, 'drill passed');
  },
});

journey({
  name: 'kiosk', acs: ['AC-167'], title: 'kiosk mode hides the Coach space and logs out after 30 min idle', clock: at(0, '08:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1, { fakeClock: at(0, '08:00') });
    await nav(l1, /^(settings|device settings)$/i, 'settings');
    await l1.getByRole('checkbox', { name: /kiosk( mode)?/i }).or(l1.getByRole('switch', { name: /kiosk/i })).first().check();
    await clickIfPresent(l1, /^(save|confirm|turn on)$/i, 2000);
    // Never hand a Locator to assert.equal: a failing diff deep-inspects the whole Playwright object graph
    // (hundreds of MB per second; it took the test machine down twice). Compare a boolean.
    assert.equal(!!(await control(l1, /^(coach|my coach)$/i, { timeout: 1500 })), false, 'Coach is hidden in kiosk mode');
    await step(l1, 'kiosk on');
    await l1.clock.fastForward(30 * 60_000 + 5_000);
    await waitText(l1.locator('body'), /sign in|signed out|logged out/i, 'kiosk logout after 30 minutes idle', 20_000);
    await step(l1, 'logged out');
  },
});

journey({
  name: 'data-meter', acs: ['AC-167'], title: 'the data meter shows bytes used and honours Wi-Fi only downloads', clock: at(0, '18:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(settings|data usage|data)$/i, 'settings');
    await waitText(await see(tid(l1, 'data-meter'), 'data-meter'), /\d+(\.\d+)?\s*(B|KB|MB|GB)\b/, 'bytes used');
    await l1.getByRole('checkbox', { name: /wi-?fi only/i }).or(l1.getByRole('switch', { name: /wi-?fi only/i })).first().check();
    const cdp = cdpFor(l1);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750, connectionType: 'cellular3g' });
    await nav(l1, /^(today|day 0|class|my class)$/i, 'day page');
    const dlc = await control(l1, /download|save offline/i, { timeout: 5000, roles: ['button', 'link'] });
    assert.ok(dlc, 'a download control on the day page (e.g. "Download for offline")');
    await dlc.click();
    await waitText(l1.locator('body'), /wi-?fi/i, 'the download held until Wi-Fi');
    await step(l1, 'held on cellular');
  },
});
