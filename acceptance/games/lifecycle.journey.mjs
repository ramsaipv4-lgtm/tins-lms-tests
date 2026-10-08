// AC-203 Start and memory (SPEC-games G2; AC-203 r3 text): following a game's deep link (story=off) reaches
// status 'title' with stats().frames >= 1 within 3 s on the phone profile for every first-wave 2D game; the JS heap
// (CDP Runtime.getHeapUsage().usedSize) after 60 s of play is <= 150 MB; leaving a game (pause, quit) makes
// window.__game undefined and requestAnimationFrame is called 0 times over the next 2 s.
// The 3D parts (<= 5 s on desktop; the WebGL context is lost after leaving) join with the 3D contract.
// Parts: 'AC-203 <gameId>: playable within 3 s' per first-wave game; 'AC-203 shared: ...' (heap and leaving, on Syntax Drop).
// data-testids used: app-ready*, game-tile-<gameId>, act-pause, act-quit
// Seeds: games-base, games-seen (no prologue in the arcade).
import { assert, step, wait, cdpFor, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, gameUrl, G, keepBusy, ownPack, tid, see } from '../lib/games.mjs';

const OWN = [
  { gameId: 'syntax-drop', packId: 'sd-strike', levelId: '1' },
  { gameId: 'whack-a-bug', packId: 'wb-loops', levelId: '1' },
  { gameId: 'aftershock', packId: 'as-area', levelId: '1' },
  { gameId: 'sniper', packId: 'sn-basics', levelId: '1' },
];
const RAF_COUNTER = () => { const raf = window.requestAnimationFrame.bind(window); window.__rafCalls = 0; window.requestAnimationFrame = (cb) => { window.__rafCalls++; return raf(cb); }; };

for (const o of OWN) {
  gamesJourney({
    name: `lifecycle-start-${o.gameId}`, acs: ['AC-203'], title: `${o.gameId}: playable within 3 s of its deep link`, profiles: ['phone'],
    seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
    async run(j) {
      const page = await j.actor('learner', P.l1);
      await page.goto(j.url + gameUrl(o.gameId, o.packId, o.levelId, { manual: false }), { waitUntil: 'commit' });
      const ms = await page.waitForFunction(() => {
        const g = window.__game; if (!g) return false;
        try { return g.state().status === 'title' && g.stats().frames >= 1 ? performance.now() : false; } catch { return false; }
      }, null, { polling: 50, timeout: 30_000 }).then((h) => h.jsonValue());
      await step(page, `${o.gameId} playable at ${Math.round(ms)} ms`);
      assert.ok(ms <= 3000, `${o.gameId}: first playable frame ${Math.round(ms)} ms after navigation (budget 3000 ms on the phone profile)`);
    },
  });
}

gamesJourney({
  name: 'lifecycle-memory', acs: ['AC-203'], title: 'shared: heap <= 150 MB after 60 s of Syntax Drop play; leaving stops the loop', profiles: ['phone'],
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 170_000,
  async run(j) {
    const page = await j.actor('learner', P.l1, { initScripts: [RAF_COUNTER] });
    const o = { gameId: 'syntax-drop', packId: 'sd-rhythm', levelId: '1' };
    await j.open(page, gameUrl(o.gameId, o.packId, o.levelId, { manual: false }));
    const g = G(page);
    await g.waitFor((s) => s && s.status === 'title', 'syntax-drop title', 30_000);
    await g.act('start');
    await keepBusy(j, page, { ...o, lvl: ownPack(o.gameId, o.packId).levels[0], ms: 60_000 });
    const { usedSize } = await cdpFor(page).send('Runtime.getHeapUsage');
    await step(page, `heap ${(usedSize / 1e6).toFixed(1)} MB`);
    assert.ok(usedSize <= 150 * 1024 * 1024, `JS heap after 60 s of play is ${(usedSize / 1048576).toFixed(1)} MB (budget 150 MB)`);

    const s = await g.state();
    if (s.status === 'playing') await (await see(tid(page, 'act-pause'), 'act-pause')).click();
    await (await see(tid(page, 'act-quit'), 'act-quit')).click();
    await page.waitForURL(/\/learn\/games\/?(\?.*)?$/, { timeout: 15_000 });
    await see(page.locator('[data-testid^="game-tile-"]'), 'the arcade after quitting', 15_000);
    assert.equal(await page.evaluate(() => typeof window.__game), 'undefined', 'window.__game is gone after leaving');
    await wait(1000);
    const c1 = await page.evaluate(() => window.__rafCalls);
    await wait(2000);
    const c2 = await page.evaluate(() => window.__rafCalls);
    await step(page, 'left the game');
    assert.equal(c2 - c1, 0, `requestAnimationFrame was called ${c2 - c1} times in the 2 s after leaving (must be 0)`);
  },
});
