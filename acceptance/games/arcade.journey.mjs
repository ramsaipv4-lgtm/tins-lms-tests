// AC-204 The arcade (/learn/games, nav "Games") lists only switched-on games that have a released pack; switching
// `games` off removes the nav entry and the routes answer "not available"; each tile opens its game and quitting
// returns to the arcade (SPEC-games G3, D-G8; games contract §13.T1).
// data-testids used: app-ready*, game-tile-<gameId>, game-pack-<packId>, game-level-<levelId>, game-unavailable,
//   act-pause, act-quit
// Accessible names used: nav /^games$/.
// Vehicle: Syntax Drop (SPEC §13.10 vertical slice). Every other first-wave game whose tile is present must open and
// quit the same way; a missing later game is not a failure here.
// Seeds: games-base + games-seen (the prologue is already seen); games-one-off (game.syntaxDrop off); games-off.
import { assert, step, see, notSee, tid, control, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, gameUrl, G, FIRST_WAVE, arcadeUrl } from '../lib/games.mjs';

const OWN = { 'syntax-drop': ['sd-strike', '1'], 'whack-a-bug': ['wb-loops', '1'], aftershock: ['as-area', '1'], sniper: ['sn-basics', '1'] };
const NOT_BUILT = ['maze-coder', 'breakout', 'garage', 'raid'];

gamesJourney({
  name: 'arcade', acs: ['AC-204'], title: 'the Games nav opens the arcade; each present first-wave tile (Syntax Drop at least) opens its game and quit returns to the arcade',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const games = await control(page, /^games$/i, { roles: ['link', 'button', 'tab', 'menuitem'] });
    assert.ok(games, 'a navigation entry named "Games"');
    await games.click();
    await page.waitForURL(/\/learn\/games/, { timeout: 15_000 });
    await see(tid(page, 'game-tile-syntax-drop'), 'game-tile-syntax-drop', 20_000);
    const present = [];
    for (const g of FIRST_WAVE) if (await tid(page, `game-tile-${g}`).count()) present.push(g);
    for (const g of NOT_BUILT) assert.equal(await tid(page, `game-tile-${g}`).count(), 0, `no tile for ${g} (no released pack)`);
    await step(page, 'arcade');
    for (const g of present) {
      const [packId, levelId] = OWN[g];
      await (await see(tid(page, `game-tile-${g}`), `game-tile-${g}`)).click();
      await (await see(tid(page, `game-pack-${packId}`), `game-pack-${packId} in the ${g} picker`, 15_000)).click();
      const lvl = tid(page, `game-level-${levelId}`);
      if (await lvl.count()) await lvl.first().click();
      const h = G(page);
      await h.waitFor((s) => s && ['title', 'story'].includes(s.status), `${g} mounted`, 30_000);
      assert.equal(await h.id(), g, `the ${g} tile opens ${g}`);
      await step(page, `${g} open`);
      if ((await h.state()).status === 'story') await h.act('skip');
      await h.act('start');
      await (await see(tid(page, 'act-pause'), 'act-pause')).click();
      await (await see(tid(page, 'act-quit'), 'act-quit')).click();
      await page.waitForURL(/\/learn\/games\/?(\?.*)?$/, { timeout: 15_000 });
      await see(tid(page, `game-tile-${g}`), `back in the arcade after quitting ${g}`, 15_000);
    }
  },
});

gamesJourney({
  name: 'arcade-one-off', acs: ['AC-204'], title: 'a switched-off game (game.syntaxDrop) has no tile and its deep link answers "not available"',
  seeds: ['games-one-off', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: arcadeUrl() });
    await see(page.locator('[data-testid="app-ready"]'), 'the arcade route');
    await notSee(tid(page, 'game-tile-syntax-drop'), 'game-tile-syntax-drop while game.syntaxDrop is off');
    await j.open(page, gameUrl('syntax-drop', 'sd-strike', '1'));
    const u = await see(tid(page, 'game-unavailable'), 'game-unavailable', 15_000);
    assert.match(await u.innerText(), /not available/i);
    assert.equal(await page.evaluate(() => typeof window.__game), 'undefined', 'no game mounted');
    await step(page, 'syntax-drop not available');
  },
});

gamesJourney({
  name: 'arcade-off', acs: ['AC-204'], title: 'with games off there is no Games nav entry and the routes answer "not available"',
  seeds: ['games-off'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const games = await control(page, /^games$/i, { roles: ['link', 'button', 'tab', 'menuitem'], timeout: 3000 });
    assert.equal(games, null, 'no "Games" navigation entry while games is off');
    for (const path of [arcadeUrl(), gameUrl('syntax-drop', 'sd-strike', '1'), '/learn/games/sniper']) {
      await j.open(page, path);
      const u = await see(tid(page, 'game-unavailable'), `game-unavailable at ${path}`, 15_000);
      assert.match(await u.innerText(), /not available/i, `${path} answers "not available"`);
      assert.equal(await page.evaluate(() => typeof window.__game), 'undefined', `no game mounted at ${path}`);
    }
    await step(page, 'games off');
  },
});
