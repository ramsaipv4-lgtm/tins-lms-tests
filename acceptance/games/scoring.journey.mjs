// AC-235 Two scores (games contract D-G19, §13.T1 stars/scores, §13.T5 sockets vs Skill events): in each first-wave
// game a round with only action misses gives mistakes: [] and knowledgeStars 3 and creates no card and no error
// note; the same round with exactly one Knowledge mistake creates exactly one of each; stars = knowledgeStars.
// Claimed by the last first-wave game to merge (D-G24); each game task runs its own journey here.
// Action misses used: syntax-drop a strike with no piece in any window; sniper a shot that hits nothing; whack-a-bug a
// whack on an empty hole; aftershock a debris hit.
// Seeds: games-base, games-seen.
import { assert, step, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, ownPack, personDocs, idsOf, waitNewResult, playSyntaxDrop, playWhack, playSniper, playAftershock, shoot, quietMoment } from '../lib/games.mjs';

async function counts(j, page) {
  const cards = (await personDocs(j, page, 'l1', 'card')).filter((c) => c.deck === 'games').length;
  const notes = (await personDocs(j, page, 'l1', 'errorNote')).length;
  return { cards, notes, results: idsOf(await personDocs(j, page, 'l1', 'gameResult')) };
}

const GAMES = {
  'syntax-drop': {
    pack: 'sd-strike', level: '1',
    async miss(g) { // a strike with no piece in any window
      await g.advanceUntil((x) => x.status === 'playing' && x.extra.pieces.length > 0, 'pieces falling');
      await quietMoment(g);
      await g.act('strike', '3');
    },
    play: (page, ctl, lvl, o) => playSyntaxDrop(page, ctl, lvl, o),
    wrong: { wrongOnce: true },
  },
  sniper: {
    pack: 'sn-basics', level: '1',
    async miss(g, page, ctl) {
      const s = await g.state();
      const t = s.extra.targets.find((x) => s.extra.bounties.some((b) => b.snippetId === x.snippetId) && !x.cover);
      await shoot(page, ctl, t.id, { miss: true });
    },
    play: (page, ctl) => playSniper(page, ctl),
    wrong: null, // shoots s-pow first
  },
  'whack-a-bug': {
    pack: 'wb-loops', level: '1',
    async miss(g) {
      const s = await g.advanceUntil((x) => x.status === 'playing', 'playing');
      const busy = new Set(s.extra.critters.filter((c) => c.upAt <= s.clockMs && s.clockMs < c.downAt).map((c) => c.line));
      const free = [1, 2, 3, 4].find((l) => !busy.has(l));
      await g.act('whack', free);
    },
    play: (page, ctl, lvl, o) => playWhack(page, ctl, lvl, o),
    wrong: { wrongLine: 4 },
  },
  aftershock: {
    pack: 'as-area', level: '1',
    async miss(g) { // stand under the first debris until it hits
      for (let i = 0; i < 2000; i++) {
        const s = await g.state();
        if (s.actionMisses > 0) { await g.act('run', 0); return; }
        const d = s.extra.debris?.[0];
        if (!d) { await g.advance(50); continue; }
        await g.act('run', Math.abs(d.x - s.extra.player.x) < 0.3 ? 0 : d.x > s.extra.player.x ? 1 : -1);
        await g.advance(30);
      }
      await g.act('run', 0);
      throw new Error('aftershock: no debris hit happened');
    },
    play: (page, ctl, lvl, o) => playAftershock(page, ctl, lvl, o),
    // one Knowledge mistake: line 1 placed with a wrong indent and knocked off by the next aftershock
    async wrongRound(g, page, ctl, lvl) {
      let s = await playAftershock(page, ctl, lvl, { order: [0, 1], indents: [0, 2], stopWhen: (x) => x.extra?.stack?.length === 2 });
      s = await g.advanceGame(s.extra.nextShockMs - s.clockMs + 50);
      return playAftershock(page, ctl, lvl, { order: [0, 1, 2, 3] });
    },
  },
};

for (const [gameId, d] of Object.entries(GAMES)) {
  gamesJourney({
    name: `scoring-${gameId}`, acs: ['AC-235'], title: `${gameId}: action misses never create cards; one Knowledge mistake creates exactly one`,
    seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 170_000,
    async run(j) {
      const page = await j.actor('learner', P.l1);
      const lvl = ownPack(gameId, d.pack).levels.find((l) => String(l.id) === d.level);
      const ctl = controller(page, gameId, 'act');
      // round 1: action misses only
      let c0 = await counts(j, page);
      let g = await openGame(j, page, { gameId, packId: d.pack, levelId: d.level });
      await g.act('start');
      await d.miss(g, page, ctl);
      let s = await g.state();
      assert.ok(s.actionMisses >= 1, `${gameId}: the planted action miss is counted`);
      assert.equal(s.knowledgeMistakes, 0, `${gameId}: an action miss is not a Knowledge mistake`);
      s = await d.play(page, ctl, lvl, {});
      assert.equal(s.status, 'won', `${gameId}: round 1 won`);
      let [r] = await waitNewResult(j, page, 'l1', c0.results);
      assert.deepEqual(r.mistakes, [], 'no Knowledge mistakes recorded');
      assert.equal(r.knowledgeStars, 3, 'knowledgeStars 3 despite action misses');
      assert.equal(r.stars, r.knowledgeStars, 'stars = knowledgeStars');
      let c1 = await counts(j, page);
      assert.equal(c1.cards, c0.cards, 'action misses create no card');
      assert.equal(c1.notes, c0.notes, 'action misses create no error note');
      await step(page, 'action misses only');
      // round 2: exactly one Knowledge mistake
      g = await openGame(j, page, { gameId, packId: d.pack, levelId: d.level });
      await g.act('start');
      if (gameId === 'sniper') {
        const t = (await g.state()).extra.targets.find((x) => x.snippetId === 's-pow');
        await shoot(page, ctl, t.id);
      }
      s = d.wrongRound ? await d.wrongRound(g, page, ctl, lvl) : await d.play(page, ctl, lvl, d.wrong || {});
      assert.equal(s.status, 'won', `${gameId}: round 2 won`);
      [r] = await waitNewResult(j, page, 'l1', c1.results);
      assert.equal(r.mistakes.length, 1, `exactly one Knowledge mistake recorded: ${JSON.stringify(r.mistakes)}`);
      assert.equal(r.stars, r.knowledgeStars, 'stars = knowledgeStars');
      const c2 = await counts(j, page);
      assert.equal(c2.cards, c1.cards + 1, 'one new card');
      assert.equal(c2.notes, c1.notes + 1, 'one new error note');
      await step(page, 'one Knowledge mistake');
    },
  });
}
