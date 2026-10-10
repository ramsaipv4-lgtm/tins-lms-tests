// AC-252 Full screen from the hub and from a game (SPEC §13.3 "Full screen", common action fullscreen G): pressing
// hub-fullscreen asks the browser for full screen on the games area and pressing it again asks to leave; in a game
// act-fullscreen and the key G do the same, in every status. Desktop and phone.
// How it is observed: headless Chromium has no window manager, so a real switch to full screen is not guaranteed.
// An init script wraps Element.prototype.requestFullscreen and Document.prototype.exitFullscreen (and the webkit
// forms), records each call and then calls the browser's own method. A press counts when document.fullscreenElement
// becomes set OR a requestFullscreen call was recorded (the request from a real user gesture is what the app
// controls; whether the headless browser grants it is not). Leaving counts when fullscreenElement is null again OR
// an exitFullscreen call was recorded.
// Seeds: games-base, games-seen. data-testids used: app-ready*, hub-fullscreen, act-fullscreen
import { assert, step, see, tid, wait, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, FULLSCREEN_RECORDER } from '../lib/games.mjs';

const fs = (page) => page.evaluate(() => ({ el: !!document.fullscreenElement, ...window.__fs }));
async function expectEnter(page, before, where) {
  await wait(300);
  const now = await fs(page);
  assert.ok(now.el || now.requests > before.requests, `${where}: full screen was requested (fullscreenElement set or requestFullscreen called)`);
  return now;
}
async function expectLeave(page, before, where) {
  await wait(300);
  const now = await fs(page);
  assert.ok((!now.el && before.el) || now.exits > before.exits, `${where}: leaving full screen was requested (fullscreenElement cleared or exitFullscreen called)`);
  return now;
}

gamesJourney({
  name: 'fullscreen', acs: ['AC-252'], title: 'full screen on and off from the hub and from a game (button and G)',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: '/learn/games?story=off', initScripts: [FULLSCREEN_RECORDER] });
    let st = await fs(page);
    await (await see(tid(page, 'hub-fullscreen'), 'hub-fullscreen', 20_000)).click();
    st = await expectEnter(page, st, 'hub-fullscreen');
    await (await see(tid(page, 'hub-fullscreen'), 'hub-fullscreen')).click();
    st = await expectLeave(page, st, 'hub-fullscreen again');
    await step(page, 'hub');
    const g = await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-strike', levelId: '1' });
    st = await fs(page);
    await (await see(tid(page, 'act-fullscreen'), 'act-fullscreen on the title')).click();
    st = await expectEnter(page, st, 'act-fullscreen');
    await (await see(tid(page, 'act-fullscreen'), 'act-fullscreen')).click();
    st = await expectLeave(page, st, 'act-fullscreen again');
    await g.act('start');
    await page.keyboard.press('g');
    st = await expectEnter(page, st, 'G while playing');
    await page.keyboard.press('g');
    st = await expectLeave(page, st, 'G again while playing');
    await step(page, 'game');
  },
});
