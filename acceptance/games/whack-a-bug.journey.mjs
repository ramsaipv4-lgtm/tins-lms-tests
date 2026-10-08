// AC-228 Whack-a-Bug: whacking the buggy line's critter replaces it with the fix and the actual output becomes the
// expected; whacking a correct line's critter deletes it and the actual output changes; the undo token restores it
// once; on hint 'color' levels bug-row critters have glow: true and on hint 'none' levels none glows (no X-ray);
// downAt - upAt = upTimeMs of the level (SPEC-games G6.6; games contract §13.T5; AC-228 r3 text).
// Fixture pack wb-loops: level 1 easy (hint color, 2500 ms), level 2 hard (hint none, 800 ms).
// Seeds: games-base, games-seen.
import { assert, step, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playWhack, ownPack } from '../lib/games.mjs';

const upAt = (line) => (x) => x.extra.critters.some((c) => c.line === line && c.upAt <= x.clockMs && x.clockMs < c.downAt - 20);

gamesJourney({
  name: 'whack-a-bug', acs: ['AC-228'], title: 'fix, flatten, undo once, hint glow by level, up-time by level',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const pack = ownPack('whack-a-bug', 'wb-loops');
    const [easy, hard] = pack.levels;
    let g = await openGame(j, page, { gameId: 'whack-a-bug', packId: 'wb-loops', levelId: '1' });
    await g.act('start');
    let s = await g.advanceUntil((x) => x.extra.critters.length > 0, 'a critter');
    for (const c of s.extra.critters) {
      assert.equal(c.downAt - c.upAt, easy.upTimeMs, 'up-time follows level 1');
      if (c.line != null && c.line !== 0) assert.equal(c.glow, c.line === easy.bugs[0].line, `easy mode: glow only on the bug row (line ${c.line})`);
    }
    const expected = s.extra.expected; const actual0 = s.extra.actual;
    assert.notEqual(actual0, expected, 'the buggy program prints the wrong output');
    s = await g.advanceUntil(upAt(4), 'a critter on line 4');
    await g.act('whack', 4);
    s = await g.state();
    assert.equal(s.extra.lines[3], null, 'whacking a correct line deletes it');
    assert.notEqual(s.extra.actual, actual0, 'the actual output changes');
    const u0 = s.extra.undoLeft;
    await g.act('undo');
    s = await g.state();
    assert.equal(s.extra.lines[3], 'print(total)', 'undo restores the line');
    assert.equal(s.extra.actual, actual0, 'and the output');
    assert.equal(s.extra.undoLeft, u0 - 1, 'the undo token is used');
    s = await g.advanceUntil(upAt(3), 'a critter on line 3');
    await g.act('whack', 3);
    const again = await g.act('undo');
    s = await g.state();
    assert.equal(s.extra.lines[2], null, 'a second undo in the same round restores nothing');
    assert.equal(again, false, 'undo is not valid without a token');
    await step(page, 'undo once');
    // the round can still be fixed: whack the bug
    s = await g.advanceUntil(upAt(easy.bugs[0].line), 'a critter on the bug line');
    await g.act('whack', easy.bugs[0].line);
    s = await g.state();
    assert.equal(s.extra.lines[easy.bugs[0].line - 1].trim(), easy.bugs[0].fix, 'whacking the bug replaces it with the fix');
    await step(page, 'bug fixed');

    g = await openGame(j, page, { gameId: 'whack-a-bug', packId: 'wb-loops', levelId: '2' });
    await g.act('start');
    s = await g.advanceUntil((x) => x.extra.critters.some((c) => c.line === hard.bugs[0].line), 'a critter on the bug line (level 2)');
    for (const c of s.extra.critters) {
      assert.equal(c.downAt - c.upAt, hard.upTimeMs, 'up-time follows level 2');
      assert.equal(c.glow, false, 'hard mode: no glow without X-ray');
    }
    s = await playWhack(page, controller(page, 'whack-a-bug', 'act'), hard);
    assert.equal(s.status, 'won');
    assert.equal(s.extra.actual, s.extra.expected, 'actual equals expected once the bug is fixed');
    await step(page, 'level 2 won');
  },
});
