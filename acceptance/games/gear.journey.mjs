// AC-238 Gear changes play only (games contract D-G21, §13.T5 gear, §13.T6; built after the owner's playtests,
// D-G24): for each first-wave game the same scripted round (same seed, clock=manual) with and without the player's
// gear gives the same mistakes, knowledgeStars and socket outcomes; no gear adds a field to __game.state().extra or
// shows glow on a hint 'none' level without X-ray; gear Action parameters change as §13.T5 says (aftershock boots:
// carrying speed x aftershock.bootsCarryFactor; sniper suppressor: scatter sniper.suppressorScatterMs).
// Seeds: games-base, games-gear (l1 owns every first-wave gear item; l2 has no player document, so no gear).
import { assert, step, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, ownPack, personDocs, idsOf, waitNewResult, playSyntaxDrop, playWhack, playSniper, playAftershock, shoot, T } from '../lib/games.mjs';

const ROUNDS = {
  'syntax-drop': ['sd-strike', '1', (page, ctl, lvl) => playSyntaxDrop(page, ctl, lvl, { wrongOnce: true })],
  'whack-a-bug': ['wb-loops', '2', (page, ctl, lvl) => playWhack(page, ctl, lvl, { wrongLine: 1 })],
  sniper: ['sn-basics', '1', (page, ctl) => playSniper(page, ctl)],
  aftershock: ['as-area', '1', (page, ctl, lvl) => playAftershock(page, ctl, lvl)],
};

async function outcome(j, page, personKey, gameId) {
  const [packId, levelId, play] = ROUNDS[gameId];
  const before = idsOf(await personDocs(j, page, personKey, 'gameResult'));
  const h = await openGame(j, page, { gameId, packId, levelId, seed: 11 });
  const keys = Object.keys((await h.state()).extra).sort();
  const lvl = ownPack(gameId, packId).levels.find((l) => String(l.id) === levelId);
  const s = await play(page, controller(page, gameId, 'act'), lvl);
  const [r] = await waitNewResult(j, page, personKey, before);
  return { keys, glow: gameId === 'whack-a-bug' ? s.extra.critters.some((c) => c.glow) : null, mistakes: r.mistakes, knowledgeStars: r.knowledgeStars, outcome: r.outcome };
}

for (const gameId of Object.keys(ROUNDS)) {
  gamesJourney({
    name: `gear-${gameId}`, acs: ['AC-238'], title: `${gameId}: the same round with and without gear has the same Knowledge outcome and no extra fields`,
    seeds: ['games-base', 'games-gear'], clock: at(0, '10:00'), timeoutMs: 170_000,
    async run(j) {
      const page = await j.actor('learner', P.l1);
      const withGear = await outcome(j, page, 'l1', gameId);
      // the same round without gear: learner l2 has no player document, so no gear
      const page2 = await j.actor('learner-2', P.l2);
      const plain = await outcome(j, page2, 'l2', gameId);
      assert.deepEqual(withGear.mistakes, plain.mistakes, 'same Knowledge mistakes with and without gear');
      assert.equal(withGear.knowledgeStars, plain.knowledgeStars, 'same knowledgeStars');
      assert.equal(withGear.outcome, plain.outcome, 'same outcome');
      assert.deepEqual(withGear.keys, plain.keys, 'gear adds no field to state().extra');
      if (gameId === 'whack-a-bug') assert.equal(withGear.glow, false, 'no glow on a hint none level without X-ray, even with gear');
      await step(page, 'same Knowledge outcome');

      if (gameId === 'aftershock') { // boots: carrying speed
        const lvl = ownPack('aftershock', 'as-area').levels[0];
        const h = await openGame(j, page, { gameId: 'aftershock', packId: 'as-area', levelId: '1' });
        let s = await playAftershock(page, controller(page, 'aftershock', 'act'), lvl, { stopWhen: (x) => x.extra?.player?.carrying });
        await h.act('run', 1); s = await h.advanceGame(200); const x0 = s.extra.player.x; s = await h.advanceGame(500); await h.act('run', 0);
        const speed = (s.extra.player.x - x0) / 0.5;
        const expect = T('aftershock.runTilesPerSec') * T('aftershock.bootsCarryFactor');
        assert.ok(Math.abs(Math.abs(speed) - expect) <= 0.5, `carrying with boots runs at ${speed.toFixed(2)} tiles/s (expected ${expect})`);
      }
      if (gameId === 'sniper') { // suppressor: scatter length
        const h = await openGame(j, page, { gameId: 'sniper', packId: 'sn-basics', levelId: '1' });
        await h.act('start');
        let s = await h.state();
        const t = s.extra.targets.find((x) => !x.cover);
        s = await shoot(page, controller(page, 'sniper', 'act'), t.id, { miss: true });
        assert.ok(Math.abs(s.extra.scatterUntilMs - s.clockMs - T('sniper.suppressorScatterMs')) <= 50, `with the suppressor the herd hides for ${s.extra.scatterUntilMs - s.clockMs} ms`);
      }
    },
  });
}
