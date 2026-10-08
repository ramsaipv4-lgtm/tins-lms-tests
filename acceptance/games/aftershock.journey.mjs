// AC-229 Aftershock: grabbing and placing the fixture lines in a correct order with correct indents passes the tests
// and plays the escape; an alternative correct order (altOrders) also passes; a wrong indent is knocked off by the
// next aftershock (test clock) and is a Knowledge mistake; kicking a decoy away is scored; placing a decoy fails the
// tests and shows the failing test (SPEC-games G6.7; games contract §13.T5 Aftershock; AC-229 r3 text).
// Fixture pack as-area: def area(w, h) / a = w / b = h / return a * b; altOrders [[0, 2, 1, 3]]; decoy "return a + b".
// Seeds: games-base, games-seen.
import { assert, step, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playAftershock, ownPack, T } from '../lib/games.mjs';

const lvl = ownPack('aftershock', 'as-area').levels[0];

gamesJourney({
  name: 'aftershock-orders', acs: ['AC-229'], title: 'the canonical order and the alternative order both pass and escape',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 170_000,
  async run(j) {
    const page = await j.actor('learner', P.l1);
    for (const order of [[0, 1, 2, 3], lvl.altOrders[0]]) {
      await openGame(j, page, { gameId: 'aftershock', packId: 'as-area', levelId: '1' });
      const s = await playAftershock(page, controller(page, 'aftershock', 'act'), lvl, { order });
      assert.equal(s.status, 'won', `order ${order} passes the tests`);
      assert.equal(s.extra.escaped, true, 'the survivor escapes');
      assert.equal(s.extra.lastTest?.passed, true, 'the last test run passed');
      await step(page, `order ${order.join('')} escaped`);
    }
  },
});

gamesJourney({
  name: 'aftershock-indent', acs: ['AC-229'], title: 'a wrong indent is knocked off by the next aftershock',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const g = await openGame(j, page, { gameId: 'aftershock', packId: 'as-area', levelId: '1' });
    let s = await playAftershock(page, controller(page, 'aftershock', 'act'), lvl, { order: [0, 1], indents: [0, 2], stopWhen: (x) => x.extra?.stack?.length === 2 });
    const k0 = s.knowledgeMistakes;
    assert.equal(s.extra.stack[1].indent, 2, 'line "a = w" placed with the wrong indent');
    s = await g.advanceGame(s.extra.nextShockMs - s.clockMs + 50);
    assert.equal(s.extra.stack.length, 1, 'the next aftershock knocks off the wrongly indented slab');
    assert.equal(s.knowledgeMistakes, k0 + 1, 'and it is a Knowledge mistake');
    await step(page, 'knocked off');
  },
});

gamesJourney({
  name: 'aftershock-decoy', acs: ['AC-229'], title: 'kicking a decoy scores; placing a decoy fails the tests and shows the failing test',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 150_000,
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const ctl = controller(page, 'aftershock', 'act');
    const g = await openGame(j, page, { gameId: 'aftershock', packId: 'as-area', levelId: '1' });
    await g.act('start');
    // kick: carry the decoy slab and kick it away
    const decoyText = lvl.decoys[0].text;
    const s0 = await playAftershock(page, ctl, { ...lvl, lines: [{ text: decoyText, indent: 1 }] }, { order: [0], stopWhen: (x) => x.extra?.player?.carrying && x.extra.slabs.some((sl) => sl.state === 'held' && sl.text.trim() === decoyText) });
    const score0 = s0.score;
    await g.act('kick');
    let s = await g.state();
    assert.ok(s.extra.slabs.some((sl) => sl.text.trim() === decoyText && sl.state === 'kicked'), 'the decoy is kicked away');
    assert.ok(s.score > score0, 'kicking a decoy is scored');
    await step(page, 'decoy kicked');
    // place a decoy instead of the return line
    s = await playAftershock(page, ctl, lvl, { decoyAt: { position: 3, decoy: 0, indent: 1 }, stopWhen: (x) => x.extra?.lastTest && x.extra.lastTest.passed === false });
    assert.equal(s.extra.lastTest.passed, false, 'the stack with the decoy fails the tests');
    assert.ok(s.extra.lastTest.failing && s.extra.lastTest.failing.test, 'the failing test is reported');
    const text = await page.locator('body').innerText();
    assert.ok(/area\s*\(\s*2\s*,\s*3\s*\)|\b6\b/.test(text), 'the failing test (area(2, 3) should be 6) is shown');
    await step(page, 'failing test shown');
  },
});
