// AC-242 Aftershock mechanics (games contract §13.T5 Aftershock; Tuning §13.T7): running moves the player at
// aftershock.runTilesPerSec and carrying slows it to x aftershock.carryFactor; a jump rises aftershock.jumpTiles;
// a debris hit costs aftershock.debrisDamage health with no Knowledge mistake, and health 0 ends in 'lost'; a passing
// stack plays the escape scene (aftershock.escape) before 'won'; TUNING equals the table. Double-jump and dash need
// gear (the shop and gear task, after the playtests).
// Fixture pack as-area. Seeds: games-base, games-seen (the intro is seen, so only the escape scene plays).
import { assert, step, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playAftershock, ownPack, assertTuningTs, T, G } from '../lib/games.mjs';

const lvl = ownPack('aftershock', 'as-area').levels[0];
async function speed(g) { await g.act('run', 1); let s = await g.advanceGame(200); const x0 = s.extra.player.x; s = await g.advanceGame(500); await g.act('run', 0); await g.advanceGame(300); return (s.extra.player.x - x0) / 0.5; }

gamesJourney({
  name: 'aftershock-moves', acs: ['AC-242'], title: 'run, carry, jump, debris and health',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 150_000,
  async run(j) {
    await assertTuningTs('aftershock.');
    const page = await j.actor('learner', P.l1);
    let g = await openGame(j, page, { gameId: 'aftershock', packId: 'as-area', levelId: '1' });
    await g.act('start');
    let s = await g.state();
    const run = await speed(g);
    assert.ok(Math.abs(run - T('aftershock.runTilesPerSec')) <= 0.5, `run speed ${run.toFixed(2)} tiles/s`);
    await g.act('jump');
    let top = 0;
    for (let i = 0; i < 40; i++) { s = await g.advanceGame(25); top = Math.max(top, s.extra.player.y); }
    assert.ok(Math.abs(top - T('aftershock.jumpTiles')) <= 0.3, `jump height ${top.toFixed(2)} tiles`);
    s = await playAftershock(page, controller(page, 'aftershock', 'act'), lvl, { stopWhen: (x) => x.extra?.player?.carrying });
    const carry = await speed(g);
    assert.ok(Math.abs(carry - T('aftershock.runTilesPerSec') * T('aftershock.carryFactor')) <= 0.5, `carrying speed ${carry.toFixed(2)} tiles/s`);
    await step(page, 'moves');
    // debris: stand under it until health is gone
    g = await openGame(j, page, { gameId: 'aftershock', packId: 'as-area', levelId: '1' });
    await g.act('start');
    s = await g.state();
    const h0 = s.extra.player.health; const k0 = s.knowledgeMistakes;
    let firstHit = true;
    for (let i = 0; i < 4000 && s.status === 'playing'; i++) {
      const d = s.extra.debris?.[0];
      if (d) await g.act('run', Math.abs(d.x - s.extra.player.x) < 0.3 ? 0 : d.x > s.extra.player.x ? 1 : -1);
      const prev = s.extra.player.health;
      s = await g.advance(30);
      if (firstHit && s.extra.player.health < prev) {
        assert.equal(prev - s.extra.player.health, T('aftershock.debrisDamage'), 'a debris hit costs aftershock.debrisDamage');
        assert.equal(s.knowledgeMistakes, k0, 'a debris hit is not a Knowledge mistake');
        firstHit = false;
      }
    }
    assert.equal(h0, T('aftershock.health'), 'health starts at aftershock.health');
    assert.equal(s.status, 'lost', 'health 0 ends in lost');
    await step(page, 'lost to debris');
  },
});

gamesJourney({
  name: 'aftershock-escape', acs: ['AC-242'], title: 'a passing stack plays the escape scene, then won',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 150_000,
  async run(j) {
    const page = await j.actor('learner', P.l1);
    await openGame(j, page, { gameId: 'aftershock', packId: 'as-area', levelId: '1', story: true });
    const s = await playAftershock(page, controller(page, 'aftershock', 'act'), lvl, { stopWhen: (x) => x.status === 'story' || x.status === 'won' || x.status === 'lost' });
    assert.equal(s.status, 'story', 'a passing stack plays a scene');
    assert.equal(s.extra.scene.id, 'aftershock.escape', 'the escape scene');
    await G(page).act('skip');
    await G(page).waitFor((x) => x.status === 'won' || x.status === 'story', 'won after the escape');
    await step(page, 'escaped');
  },
});
