// AC-207 Every game can be finished with the keyboard only and with on-screen buttons only; pause and story scenes
// stop the game clock; assist halves the game speed (Action only) and sets assist: true on the result
// (SPEC-games G3; games contract §13.T1 common keys, §13.T5 per-game keys, act-<action>[-<arg>] buttons).
// Keyboard runs use page.keyboard only; button runs use pointer clicks on act-* buttons only; both use
// __game.advance with clock=manual to move time (a test hook, not an input).
// data-testids used: app-ready*, act-<action>, act-<action>-<arg>, game-results
// Seeds: games-base, games-seen.
import { assert, step, see, tid, wait, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, ownPack, level, playSyntaxDrop, playWhack, playSniper, playAftershock, personDocs, idsOf, waitNewResult, T } from '../lib/games.mjs';

const PLAY = {
  'syntax-drop': [['sd-strike', '1'], ['sd-fill', '1']],
  'whack-a-bug': [['wb-loops', '1']],
  sniper: [['sn-basics', '1']],
  aftershock: [['as-area', '1']],
};
async function finish(page, gameId, packId, lvl, ctl) {
  if (gameId === 'syntax-drop') return playSyntaxDrop(page, ctl, lvl);
  if (gameId === 'whack-a-bug') return playWhack(page, ctl, lvl);
  if (gameId === 'sniper') return playSniper(page, ctl);
  return playAftershock(page, ctl, lvl);
}

for (const [gameId, levels] of Object.entries(PLAY)) {
  gamesJourney({
    name: `controls-${gameId}`, acs: ['AC-207'], title: `${gameId} can be finished with the keyboard only and with on-screen buttons only`,
    seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 170_000,
    async run(j) {
      const page = await j.actor('learner', P.l1);
      for (const mode of ['keys', 'buttons']) {
        for (const [packId, levelId] of levels) {
          await openGame(j, page, { gameId, packId, levelId });
          const s = await finish(page, gameId, packId, level(ownPack(gameId, packId), levelId), controller(page, gameId, mode));
          assert.equal(s.status, 'won', `${gameId}/${packId} finished (${mode} only)`);
          await see(tid(page, 'game-results'), 'game-results');
          await step(page, `${gameId} ${packId} won with ${mode}`);
        }
      }
    },
  });
}

gamesJourney({
  name: 'controls-pause-assist', acs: ['AC-207'], title: 'pause stops the game clock; assist halves it and is recorded on the result',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    let g = await openGame(j, page, { gameId: 'whack-a-bug', packId: 'wb-loops', levelId: '1' });
    await page.keyboard.press('Enter');
    await g.advance(500);
    await page.keyboard.press('p');
    let s = await g.state();
    assert.equal(s.status, 'paused', 'P pauses');
    const c0 = s.clockMs;
    await g.advance(1000); await wait(1000);
    assert.equal((await g.state()).clockMs, c0, 'the game clock does not move while paused');
    await page.keyboard.press('p');
    assert.equal((await g.state()).status, 'playing', 'P resumes');
    await step(page, 'pause checked');

    const before = idsOf(await personDocs(j, page, 'l1', 'gameResult'));
    g = await openGame(j, page, { gameId: 'whack-a-bug', packId: 'wb-loops', levelId: '1' });
    await page.keyboard.press('h');
    assert.equal((await g.state()).assist, true, 'H turns assist on at the title screen');
    await page.keyboard.press('Enter');
    const a0 = (await g.state()).clockMs;
    s = await g.advance(1000);
    const expected = 1000 * T('common.assistFactor');
    assert.ok(Math.abs(s.clockMs - a0 - expected) <= 20, `with assist, 1000 ms of driver time moves the game clock ${s.clockMs - a0} ms (expected ${expected})`);
    s = await playWhack(page, controller(page, 'whack-a-bug', 'act'), ownPack('whack-a-bug', 'wb-loops').levels[0]);
    assert.equal(s.status, 'won');
    const [r] = await waitNewResult(j, page, 'l1', before);
    assert.equal(r.assist, true, 'the result records assist: true');
    assert.deepEqual(r.mistakes, [], 'assist is never punished (no mistakes added)');
    await step(page, 'assist checked');
  },
});
