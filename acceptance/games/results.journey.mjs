// AC-205 Finishing a round writes one gameResult { personId, classId, gameId, packId, levelId, score, stars, skill,
// knowledgeStars, xp, coins, outcome, mistakes:[{ itemId, concept }], assist, durationMs, at } with stars =
// knowledgeStars; each Knowledge mistake upserts a card (with concept) and an errorNote (subtopic = concept) in the
// person database and the error notebook lists it; the mastery map gains mastery-skill-<concept> (games contract
// §13.T1, D-G15, D-G19, Appendix G-E).
// Round: whack-a-bug wb-loops level 1 (clock=manual, story=off): whack the healthy line 4 (a Knowledge mistake on
// bug 0, concept loops.range), undo it, then whack the bug on line 2.
// data-testids used: app-ready*, game-results, result-mistake-<n>, error-notebook*, mastery-map*, mastery-skill-<skill>
// Accessible names used: nav /error notebook|mistakes/, /mastery|progress/.
import { assert, step, see, tid, nav, waitText, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playWhack, ownPack, personDocs, idsOf, waitNewResult, T } from '../lib/games.mjs';

gamesJourney({
  name: 'results', acs: ['AC-205'], title: 'one gameResult with the contract fields; the Knowledge mistake becomes a card, an error note and a mastery row',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const lvl = ownPack('whack-a-bug', 'wb-loops').levels[0];
    const before = idsOf(await personDocs(j, page, 'l1', 'gameResult'));
    const g = await openGame(j, page, { gameId: 'whack-a-bug', packId: 'wb-loops', levelId: '1' });
    const ctl = controller(page, 'whack-a-bug', 'act');
    await g.act('start');
    // a Knowledge mistake: whack the healthy print line, then use the undo token
    let s = await g.advanceUntil((x) => x.extra.critters.some((c) => c.line === 4 && c.upAt <= x.clockMs && x.clockMs < c.downAt - 20), 'a critter on line 4');
    await g.act('whack', 4);
    s = await g.state();
    assert.equal(s.knowledgeMistakes, 1, 'whacking a healthy row is a Knowledge mistake');
    await g.act('undo');
    s = await playWhack(page, ctl, lvl);
    assert.equal(s.status, 'won', 'the round is won');
    await see(tid(page, 'game-results'), 'game-results');
    await see(tid(page, 'result-mistake-1'), 'result-mistake-1');
    await step(page, 'results');

    const [r, ...more] = await waitNewResult(j, page, 'l1', before);
    assert.equal(more.length, 0, 'exactly one gameResult for one round');
    for (const f of ['personId', 'classId', 'gameId', 'packId', 'levelId', 'score', 'stars', 'skill', 'knowledgeStars', 'xp', 'coins', 'outcome', 'mistakes', 'assist', 'durationMs', 'at']) assert.ok(f in r, `gameResult has ${f}`);
    assert.equal(r.personId, 'person:l1'); assert.equal(r.classId, 'class:c1');
    assert.equal(r.gameId, 'whack-a-bug'); assert.equal(r.packId, 'wb-loops'); assert.equal(String(r.levelId), '1');
    assert.deepEqual(r.mistakes, [{ itemId: 'bug:0', concept: 'loops.range' }], 'one Knowledge mistake on bug 0');
    assert.equal(r.stars, r.knowledgeStars, 'stars = knowledgeStars');
    assert.equal(r.knowledgeStars, 1 <= T('common.starsTwoMaxMistakes') ? 2 : 1, 'every socket answered with one mistake');
    assert.equal(r.outcome, 'won'); assert.equal(r.assist, false);
    assert.ok(Number.isFinite(r.score) && Number.isFinite(r.skill) && r.durationMs > 0 && Number.isFinite(r.at), 'numbers');

    const cards = (await personDocs(j, page, 'l1', 'card')).filter((c) => c.concept === 'loops.range');
    assert.equal(cards.length, 1, 'one game card with concept loops.range');
    assert.equal(cards[0].deck, 'games');
    const notes = (await personDocs(j, page, 'l1', 'errorNote')).filter((n) => n.subtopic === 'loops.range');
    assert.equal(notes.length, 1, 'one error note with subtopic loops.range');

    await nav(page, /^(error notebook|mistakes|my mistakes|notebook)$/i, 'error notebook');
    await waitText(await see(tid(page, 'error-notebook'), 'error-notebook'), /loops\.range/i, 'the error notebook lists loops.range');
    await nav(page, /^(mastery|mastery map|progress|my progress)$/i, 'mastery map');
    await see(tid(page, 'mastery-map'), 'mastery-map');
    const row = await see(tid(page, 'mastery-skill-loops.range'), 'mastery-skill-loops.range', 15_000);
    assert.ok(['not-yet', 'mastered'].includes(await row.getAttribute('data-state')), 'the mastery row has a state');
    await step(page, 'mastery');
  },
});
