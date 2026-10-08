// AC-227 Snippet Sniper: hitting the target whose snippet prints the bounty claims it; hitting a wrong target wastes
// one ammo, is a Knowledge mistake and the miss lists the snippet's real output; missing every target uses one ammo
// with no mistake; ammo = bounties + slack; claimed bounties raise the rank (thresholds in the Tuning table) and
// Sharpshooter unlocks the boss; in the boss battle the right plate opens and the squad advances
// (SPEC-games G6.5; games contract §13.T5 Sniper; AC-227 r3 text).
// Fixture pack sn-basics: level 1 and 2 with 3 bounties each (default slack), level 3 the boss (plates + callouts).
// data-testids used: app-ready*, game-unavailable
// Seeds: games-base, games-seen.
import { assert, step, see, tid, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playSniper, shoot, ownPack, snippetOutputs, T, gameUrl } from '../lib/games.mjs';

const rankFor = (n) => (n >= T('sniper.rankGhost') ? 'Ghost' : n >= T('sniper.rankSharpshooter') ? 'Sharpshooter' : n >= T('sniper.rankMarksman') ? 'Marksman' : 'Recruit');

gamesJourney({
  name: 'sniper', acs: ['AC-227'], title: 'bounties, wrong target, ammo, rank and the boss battle',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 170_000,
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const pack = ownPack('sniper', 'sn-basics');
    const outs = snippetOutputs().snippets;
    const ctl = controller(page, 'sniper', 'act');

    // the boss level is locked before Sharpshooter
    await j.open(page, gameUrl('sniper', 'sn-basics', '3'));
    await see(tid(page, 'game-unavailable'), 'game-unavailable for the locked boss level', 15_000);

    // level 1: ammo, a wrong target, a clean miss, then the bounties
    let g = await openGame(j, page, { gameId: 'sniper', packId: 'sn-basics', levelId: '1' });
    await g.act('start');
    let s = await g.state();
    const lv1 = pack.levels[0];
    assert.equal(s.extra.ammo, lv1.bounties.length + T('sniper.slackLevel1'), 'ammo = bounties + slack (level 1)');
    assert.equal(s.extra.rank, rankFor(0), 'rank starts at Recruit');
    const wrong = s.extra.targets.find((t) => t.snippetId === 's-pow');
    s = await shoot(page, ctl, wrong.id);
    assert.equal(s.extra.ammo, lv1.bounties.length + T('sniper.slackLevel1') - 1, 'a wrong target uses one ammo');
    assert.equal(s.knowledgeMistakes, 1, 'hitting a wrong target is a Knowledge mistake');
    assert.equal(s.extra.lastShot.output, outs['s-pow'], "the miss lists the snippet's real output");
    assert.ok((await page.locator('body').innerText()).includes(outs['s-pow']), 'the real output is shown on screen');
    await step(page, 'wrong target');
    const right = s.extra.targets.find((t) => t.snippetId === lv1.bounties[0].snippetId && !t.cover) || s.extra.targets.find((t) => t.snippetId === lv1.bounties[0].snippetId);
    if (right.cover) s = await g.advanceGame(s.extra.scatterUntilMs - s.clockMs + 20);
    const a0 = s.extra.ammo;
    s = await shoot(page, ctl, right.id, { miss: true });
    assert.equal(s.extra.ammo, a0 - 1, 'a miss uses one ammo');
    assert.equal(s.knowledgeMistakes, 1, 'a miss is not a Knowledge mistake');
    assert.ok(s.actionMisses >= 1, 'a miss is an action miss');
    s = await playSniper(page, ctl);
    assert.equal(s.status, 'won', 'level 1 won');
    assert.ok(s.extra.bounties.every((b) => b.claimed), 'every bounty claimed');
    await step(page, 'level 1 won');

    // level 2: rank after 3 claimed
    g = await openGame(j, page, { gameId: 'sniper', packId: 'sn-basics', levelId: '2' });
    await g.act('start');
    s = await g.state();
    assert.equal(s.extra.rank, rankFor(3), 'rank after 3 claimed bounties');
    assert.equal(s.extra.ammo, pack.levels[1].bounties.length + T('sniper.slackLevel2'), 'ammo = bounties + slack (level 2)');
    s = await playSniper(page, ctl);
    assert.equal(s.status, 'won', 'level 2 won');

    // level 3: Sharpshooter unlocks the boss; the right plate opens and the squad advances
    g = await openGame(j, page, { gameId: 'sniper', packId: 'sn-basics', levelId: '3' });
    await g.act('start');
    s = await g.state();
    assert.equal(s.extra.rank, rankFor(6), 'Sharpshooter after 6 claimed bounties');
    assert.ok(s.extra.boss && s.extra.boss.callout, 'the boss battle with a call-out');
    const want = s.extra.boss.callout.output;
    const plate = s.extra.boss.plates.find((p) => outs[p.snippetId] === want);
    const step0 = s.extra.boss.squadStep;
    s = await shoot(page, ctl, plate.id);
    assert.ok(s.extra.boss.plates.find((p) => p.id === plate.id).open, 'the right plate opens');
    assert.equal(s.extra.boss.squadStep, step0 + 1, 'the squad advances');
    s = await playSniper(page, ctl);
    assert.equal(s.status, 'won', 'the boss is beaten');
    await step(page, 'boss beaten');
  },
});
