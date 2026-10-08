// AC-206 Nothing in the arcade or any game shows another learner's individual score; the celebration wall shows each
// team's average XP per current member only (games contract D-G15, 13.T6 team total; AC-206 r3 text).
// Vehicle: Syntax Drop (SPEC §13.10); pickers of the other first-wave games are checked when their tile is present.
// Seed games-privacy (Syntax Drop results): l1 scored 1234 (xp 1000); l2 98765 (xp 4320); l3 87654 (xp 3000).
// team-a (l1, l2) average xp 2660; team-b (l3 only) 3000.
// data-testids used: app-ready*, game-tile-<gameId> (data-last-score), celebration-wall*, wall-team-<teamId>,
//   game-pack-<packId>
// Accessible names used: nav /wall|badges|celebration/.
import { assert, step, see, tid, nav, waitText, at, P, NAMES } from '../journeys/_harness.mjs';
import { gamesJourney, arcadeUrl, gameUrl, G, FIRST_WAVE } from '../lib/games.mjs';

const FOREIGN = ['98765', '87654', '4320', '4,320', NAMES['person:l2'], NAMES['person:l3']];
const clean = (text, where) => { for (const f of FOREIGN) assert.ok(!text.includes(f), `${where} shows "${f}", another learner's individual data`); };

gamesJourney({
  name: 'privacy', acs: ['AC-206'], title: "no other learner's score anywhere in the games; the wall shows team average XP only",
  seeds: ['games-base', 'games-privacy'], clock: at(0, '11:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: arcadeUrl() });
    const tile = await see(tid(page, 'game-tile-syntax-drop'), 'game-tile-syntax-drop', 20_000);
    assert.equal(await tile.getAttribute('data-last-score'), '1234', "the tile shows l1's own last score");
    clean(await page.locator('body').innerText(), 'the arcade');
    const present = [];
    for (const g of FIRST_WAVE) if (await tid(page, `game-tile-${g}`).count()) present.push(g);
    for (const g of present) {
      await j.open(page, `/learn/games/${g}?story=off`);
      await see(page.locator('[data-testid^="game-pack-"]'), `the ${g} picker`, 15_000);
      clean(await page.locator('body').innerText(), `the ${g} picker`);
    }
    await j.open(page, gameUrl('syntax-drop', 'sd-strike', '1'));
    await G(page).waitFor((s) => s && s.status === 'title', 'syntax-drop title');
    clean(await page.locator('body').innerText(), 'the syntax-drop title screen');
    await step(page, 'games screens clean');

    await j.open(page, '/');
    await nav(page, /^(wall|badges|celebration wall|team badges)$/i, 'celebration wall');
    const wall = await see(tid(page, 'celebration-wall'), 'celebration-wall');
    await waitText(await see(tid(page, 'wall-team-team-a'), 'wall-team-team-a', 20_000), /2[,.\s ]?660/, 'team-a average XP 2660', 20_000);
    await waitText(await see(tid(page, 'wall-team-team-b'), 'wall-team-team-b'), /3[,.\s ]?000/, 'team-b average XP 3000');
    clean(await wall.innerText(), 'the celebration wall');
    await step(page, 'wall');
  },
});
