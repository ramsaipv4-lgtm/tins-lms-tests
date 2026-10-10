// AC-249 The game page (SPEC §13.3 "The game page"): /learn/games/syntax-drop shows game-page-syntax-drop with the
// story blurb, one big Play button, the packs and, for the chosen pack, every level in order with a plain unlock
// hint on each locked level (game-level-unlock-<levelId>); the learner's own best (game-best: data-score 500 and
// data-stars 2 from the seeded results) and the team's total (game-team-total: team-a's average XP 2660, as on the
// wall); Play opens the first unlocked level not yet won in the pack last played (sd-path, level 1 won); hub-back
// returns to Home. Desktop and phone.
// Seed games-hub, clock day 9. The SPEC gives no level-unlock rule for Syntax Drop, so the test checks the hint on
// whichever levels the page marks locked and derives Play's target from the page.
// data-testids used: app-ready*, game-page-<gameId>, game-blurb, game-play, game-pack-<packId>, game-level-<levelId>,
//   game-level-unlock-<levelId>, game-best, game-team-total, hub-back, hub-row-games
import { assert, step, see, tid, P } from '../journeys/_harness.mjs';
import { gamesJourney, dayAt, G } from '../lib/games.mjs';

gamesJourney({
  name: 'game-page', acs: ['AC-249'], title: 'blurb, Play, level path with unlock hints, own best, team total, back to Home',
  seeds: ['games-hub'], clock: dayAt(9, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: '/learn/games?story=off' });
    await (await see(tid(page, 'game-tile-syntax-drop'), 'game-tile-syntax-drop', 20_000)).click();
    await page.waitForURL(/\/learn\/games\/syntax-drop(\?.*)?$/, { timeout: 15_000 });
    const gp = await see(tid(page, 'game-page-syntax-drop'), 'game-page-syntax-drop');
    assert.ok((await (await see(gp.getByTestId('game-blurb'), 'game-blurb')).innerText()).trim().length > 0, 'the story blurb has text');
    const play = await see(gp.getByTestId('game-play'), 'game-play');
    const pb = await play.boundingBox();
    assert.ok(pb.width >= 44 && pb.height >= 44, 'Play is a big button');
    for (const p of ['sd-strike', 'sd-fill', 'sd-path']) await see(gp.getByTestId(`game-pack-${p}`), `game-pack-${p}`);
    await gp.getByTestId('game-pack-sd-path').click();
    const levels = await gp.locator('[data-testid^="game-level-"]:not([data-testid^="game-level-unlock-"])').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid').slice('game-level-'.length), locked: e.getAttribute('data-locked') === 'true' })));
    assert.deepEqual(levels.map((l) => l.id), ['1', '2', '3'], 'every level of sd-path in order');
    assert.equal(levels[0].locked, false, 'level 1 is open');
    for (const l of levels.filter((x) => x.locked)) {
      const hint = await see(gp.getByTestId(`game-level-unlock-${l.id}`), `game-level-unlock-${l.id}`);
      assert.ok((await hint.innerText()).trim().length > 0, `locked level ${l.id} says how to open it`);
    }
    const best = await see(gp.getByTestId('game-best'), 'game-best');
    assert.equal(await best.getAttribute('data-score'), '500', 'own best score');
    assert.equal(await best.getAttribute('data-stars'), '2', 'own best stars');
    assert.match(await (await see(gp.getByTestId('game-team-total'), 'game-team-total')).innerText(), /2[,.\s ]?660/, "the team's average XP");
    assert.ok(!(await gp.innerText()).includes('98765'), "no other learner's score on the game page");
    await step(page, 'game page');
    const target = levels.find((l) => !l.locked && l.id !== '1')?.id;
    await play.click();
    const g = G(page);
    const s = await g.waitFor((x) => x && ['title', 'story'].includes(x.status), 'the level opened by Play', 30_000);
    assert.match(page.url(), /\/learn\/games\/syntax-drop\/sd-path\//, 'Play opens a level of the pack last played (sd-path)');
    if (target) assert.equal(String(s.levelId), target, `Play opens the first unlocked level not yet won (${target})`);
    else assert.notEqual(String(s.levelId), '1', 'Play does not reopen the level already won');
    await step(page, 'play');
    await j.open(page, '/learn/games/syntax-drop?story=off');
    await (await see(tid(page, 'hub-back'), 'hub-back')).click();
    await page.waitForURL(/\/learn\/games\/?(\?.*)?$/, { timeout: 15_000 });
    await see(tid(page, 'hub-row-games'), 'Home after hub-back');
  },
});
