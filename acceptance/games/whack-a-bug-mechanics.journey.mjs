// AC-241 Whack-a-Bug mechanics (games contract §13.T5 Whack-a-Bug; Tuning §13.T7): a tap (hold <= whack.tapMaxMs)
// hits a normal critter; an armored critter needs a smash (hold whack.smashMinMs..whack.smashMaxMs) and a tap on it
// clanks (action miss); a fizzled release is an action miss; a golden critter (line 0) gives whack.goldenCoins; a
// critter that ducks before the hit is an action miss; X-ray goggles are earned every whack.xrayEveryCombo combo and
// show glow for whack.xrayMs on hint 'none' levels; a hit while X-ray is active is assisted: it fixes the row, counts in
// extra.assisted and gameResult.assisted, and is neither correct nor a mistake; TUNING equals the table.
// Fixture pack wb-loops level 2 (hint none, 800 ms up, two critters at once). Seeds: games-base, games-seen.
// Armored and golden critters come from the seeded randomness; the driver waits for them (bounded).
import { assert, step, see, tid, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, ownPack, personDocs, idsOf, waitNewResult, assertTuningTs, T } from '../lib/games.mjs';

const live = (s, pred) => s.extra.critters.find((c) => c.upAt <= s.clockMs && s.clockMs < c.downAt - 60 && pred(c));

gamesJourney({
  name: 'whack-mechanics', acs: ['AC-241'], title: 'tap, smash, clank, fizzle, golden, duck, X-ray and assisted hits',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 170_000,
  async run(j) {
    await assertTuningTs('whack.');
    const page = await j.actor('learner', P.l1);
    const lvl = ownPack('whack-a-bug', 'wb-loops').levels[1];
    const bug = lvl.bugs[0].line;
    const before = idsOf(await personDocs(j, page, 'l1', 'gameResult'));
    const g = await openGame(j, page, { gameId: 'whack-a-bug', packId: 'wb-loops', levelId: '2' });
    await g.act('start');
    const MAX = { stepMs: 20, maxMs: 300_000 };
    // a tap on an armored critter clanks
    let s = await g.advanceUntil((x) => live(x, (c) => c.armored && c.line), 'an armored critter', MAX);
    let c = live(s, (k) => k.armored && k.line);
    let m0 = s.actionMisses; const lines0 = JSON.stringify(s.extra.lines);
    await g.act('whack', c.line);
    s = await g.state();
    assert.equal(s.actionMisses, m0 + 1, 'a tap on an armored critter clanks (action miss)');
    assert.equal(JSON.stringify(s.extra.lines), lines0, 'the clank changes no line');
    // a fizzled release (between tap and smash windows)
    s = await g.advanceUntil((x) => live(x, (k) => k.line && k.line !== bug), 'a critter on a healthy line', MAX);
    c = live(s, (k) => k.line && k.line !== bug);
    m0 = s.actionMisses;
    await g.act('charge', c.line);
    await g.advanceGame((T('whack.tapMaxMs') + T('whack.smashMinMs')) / 2);
    await g.act('release');
    s = await g.state();
    assert.equal(s.actionMisses, m0 + 1, 'a release between the tap and smash windows fizzles (action miss)');
    // a golden critter (line 0) gives coins
    s = await g.advanceUntil((x) => live(x, (k) => k.golden), 'a golden critter', MAX);
    const k0 = s.knowledgeMistakes; const score0 = s.score;
    await g.act('whack', 0);
    s = await g.state();
    assert.ok(s.score > score0, 'a golden critter scores');
    assert.equal(s.knowledgeMistakes, k0, 'golden critters are pure Skill');
    // a critter that ducks before the hit
    s = await g.advanceUntil((x) => x.extra.critters.some((k) => k.line && k.line !== bug && k.downAt <= x.clockMs && k.downAt > x.clockMs - 200), 'a critter that just ducked', MAX);
    c = s.extra.critters.find((k) => k.line && k.line !== bug && k.downAt <= s.clockMs);
    if (!live(s, (k) => k.line === c.line)) {
      m0 = s.actionMisses;
      await g.act('whack', c.line);
      assert.equal((await g.state()).actionMisses, m0 + 1, 'a hit after the critter ducked is an action miss');
    }
    await step(page, 'clank, fizzle, golden, duck');
    // earn X-ray by combo on golden critters, then an assisted fix
    s = await g.state();
    for (let i = 0; i < 400 && !(s.extra.xray?.charges > 0); i++) {
      s = await g.advanceUntil((x) => live(x, (k) => k.golden) || x.extra.xray?.charges > 0, 'golden critters for the X-ray combo', MAX);
      if (s.extra.xray?.charges > 0) break;
      await g.act('whack', 0); s = await g.state();
    }
    assert.ok(s.extra.xray.charges > 0, `an X-ray charge after ${T('whack.xrayEveryCombo')} combo`);
    s = await g.advanceUntil((x) => live(x, (k) => k.line === bug && !k.armored), 'a normal critter on the bug line', MAX);
    assert.equal(live(s, (k) => k.line === bug).glow, false, 'no glow before X-ray on a hint none level');
    await g.act('xray');
    s = await g.state();
    assert.equal(live(s, (k) => k.line === bug).glow, true, 'X-ray shows the glow on the bug row');
    assert.ok(Math.abs(s.extra.xray.untilMs - s.clockMs - T('whack.xrayMs')) <= 50, 'X-ray lasts whack.xrayMs');
    const kBefore = s.knowledgeMistakes;
    await g.act('whack', bug);
    s = await g.state();
    assert.equal(s.extra.assisted, 1, 'the hit under X-ray is assisted');
    assert.equal(s.knowledgeMistakes, kBefore, 'an assisted hit is not a mistake');
    assert.equal(s.extra.lines[bug - 1].trim(), lvl.bugs[0].fix, 'an assisted hit still fixes the row');
    s = await g.advanceUntil((x) => x.status === 'won', 'the round to be won', MAX);
    await see(tid(page, 'result-assisted'), 'result-assisted');
    const [r] = await waitNewResult(j, page, 'l1', before);
    assert.equal(r.assisted, 1, 'gameResult.assisted = 1');
    assert.ok(r.knowledgeStars <= 1, 'an assisted socket earns no Knowledge credit (at most 1 star)');
    assert.equal(r.mistakes.length, 0, 'and creates no mistake');
    await step(page, 'assisted');
  },
});
