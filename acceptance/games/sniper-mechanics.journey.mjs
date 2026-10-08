// AC-240 Sniper mechanics (games contract §13.T5 Sniper; Tuning §13.T7): holding breath shrinks the sway in aimError
// (to about sniper.breathSwayFactor) for at most sniper.breathMs; with wind or drop, the steady aim error grows with
// the target's distance; a missed shot scatters the targets behind cover for sniper.scatterMs; firing is blocked while
// binoculars are up; a miss on the right target uses ammo with no Knowledge mistake; TUNING equals the table.
// Fixture pack sn-basics level 1. Seeds: games-base, games-seen.
import { assert, step, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, shoot, assertTuningTs, T } from '../lib/games.mjs';

async function swaySpread(g, ms, stepMs = 50) {
  const xs = []; const ys = [];
  for (let t = 0; t < ms; t += stepMs) { const s = await g.advance(stepMs); if (s.extra.aimError) { xs.push(s.extra.aimError.x); ys.push(s.extra.aimError.y); } }
  const spread = (a) => Math.max(...a) - Math.min(...a);
  return { spread: Math.hypot(spread(xs), spread(ys)), mean: Math.hypot(xs.reduce((n, v) => n + v, 0) / xs.length, ys.reduce((n, v) => n + v, 0) / ys.length) };
}

gamesJourney({
  name: 'sniper-mechanics', acs: ['AC-240'], title: 'breath, wind and drop, scatter, binoculars, misses',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 150_000,
  async run(j) {
    await assertTuningTs('sniper.');
    const page = await j.actor('learner', P.l1);
    const g = await openGame(j, page, { gameId: 'sniper', packId: 'sn-basics', levelId: '1' });
    const ctl = controller(page, 'sniper', 'act');
    await g.act('start');
    let s = await g.state();
    const byDist = [...s.extra.targets].sort((a, b) => a.distance - b.distance);
    const near = byDist[0]; const far = byDist[byDist.length - 1];
    await g.act('aim', near.id);
    const free = await swaySpread(g, 1000);
    await g.act('breathe', true);
    const held = await swaySpread(g, 1000);
    assert.ok(held.spread <= free.spread * (T('sniper.breathSwayFactor') + 0.15), `breathing shrinks the sway (${held.spread.toFixed(3)} vs ${free.spread.toFixed(3)})`);
    s = await g.advanceGame(T('sniper.breathMs'));
    assert.ok(s.extra.breath <= 0.001 || s.extra.breathing === false, 'breath runs out after sniper.breathMs');
    await g.act('breathe', false);
    await step(page, 'breath');

    if (s.extra.wind !== 0 && far.distance > near.distance) {
      await g.act('aim', near.id); const a = await swaySpread(g, 800);
      await g.act('aim', far.id); const b = await swaySpread(g, 800);
      assert.ok(b.mean > a.mean, `the steady aim error grows with distance under wind/drop (${a.mean.toFixed(3)} near vs ${b.mean.toFixed(3)} far)`);
    }

    await g.act('binoculars');
    s = await g.state();
    assert.equal(s.extra.binoculars, true, 'binoculars up');
    const ammo0 = s.extra.ammo;
    assert.equal(await g.act('fire'), false, 'firing is blocked while binoculars are up');
    assert.equal((await g.state()).extra.ammo, ammo0, 'no ammo used');
    await g.act('binoculars');
    await step(page, 'binoculars');

    s = await g.state();
    const right = s.extra.targets.find((t) => t.snippetId === s.extra.bounties[0].snippetId);
    const k0 = s.knowledgeMistakes; const m0 = s.actionMisses; const a0 = s.extra.ammo;
    s = await shoot(page, ctl, right.id, { miss: true });
    assert.equal(s.extra.lastShot.hit, false, 'the shot missed');
    assert.equal(s.extra.ammo, a0 - 1, 'a miss uses one ammo');
    assert.equal(s.knowledgeMistakes, k0, 'a miss on the right target is not a Knowledge mistake');
    assert.equal(s.actionMisses, m0 + 1, 'it is an action miss');
    assert.ok(Math.abs(s.extra.scatterUntilMs - s.clockMs - T('sniper.scatterMs')) <= 50, `the herd hides for sniper.scatterMs (${s.extra.scatterUntilMs - s.clockMs} ms)`);
    assert.ok(s.extra.targets.every((t) => t.cover), 'every target is behind cover while scattered');
    s = await g.advanceGame(T('sniper.scatterMs') + 100);
    assert.ok(s.extra.targets.some((t) => !t.cover), 'targets come out after the scatter');
    await step(page, 'scatter');
  },
});
