// AC-205 Finishing a round writes one gameResult { personId, classId, gameId, packId, levelId, score, stars, skill,
// knowledgeStars, xp, coins, outcome, mistakes:[{ itemId, concept }], assist, durationMs, at } with stars =
// knowledgeStars; each Knowledge mistake upserts a card (with concept) and an errorNote (subtopic = concept) in the
// person database and the error notebook lists it; the mastery map gains mastery-skill-<concept> (games contract
// §13.T1, D-G15, D-G19, Appendix G-E).
// Vehicle: Syntax Drop (SPEC §13.10). Round: sd-strike level 1 (clock=manual, story=off), played right except that the
// first decoy (<h7>, p-h7, concept html.headings) is struck once: one Knowledge mistake.
// data-testids used: app-ready*, game-results, result-mistake-<n>, error-notebook*, mastery-map*, mastery-skill-<skill>
// Accessible names used: nav /error notebook|mistakes/, /mastery|progress/.
import { assert, step, see, tid, nav, waitText, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playSyntaxDrop, ownPack, personDocs, idsOf, waitNewResult, T } from '../lib/games.mjs';

gamesJourney({
  name: 'results', acs: ['AC-205'], title: 'one gameResult with the contract fields; the Knowledge mistake becomes a card, an error note and a mastery row',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const lvl = ownPack('syntax-drop', 'sd-strike').levels[0];
    const before = idsOf(await personDocs(j, page, 'l1', 'gameResult'));
    await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-strike', levelId: '1' });
    const s = await playSyntaxDrop(page, controller(page, 'syntax-drop', 'act'), lvl, { wrongOnce: true });
    assert.equal(s.status, 'won', 'the round is won');
    assert.equal(s.knowledgeMistakes, 1, 'striking the decoy was the one Knowledge mistake');
    await see(tid(page, 'game-results'), 'game-results');
    await see(tid(page, 'result-mistake-1'), 'result-mistake-1');
    await step(page, 'results');

    const [r, ...more] = await waitNewResult(j, page, 'l1', before);
    assert.equal(more.length, 0, 'exactly one gameResult for one round');
    for (const f of ['personId', 'classId', 'gameId', 'packId', 'levelId', 'score', 'stars', 'skill', 'knowledgeStars', 'xp', 'coins', 'outcome', 'mistakes', 'assist', 'durationMs', 'at']) assert.ok(f in r, `gameResult has ${f}`);
    assert.equal(r.personId, 'person:l1'); assert.equal(r.classId, 'class:c1');
    assert.equal(r.gameId, 'syntax-drop'); assert.equal(r.packId, 'sd-strike'); assert.equal(String(r.levelId), '1');
    assert.deepEqual(r.mistakes, [{ itemId: 'p-h7', concept: 'html.headings' }], 'one Knowledge mistake on the decoy p-h7');
    assert.equal(r.stars, r.knowledgeStars, 'stars = knowledgeStars');
    assert.equal(r.knowledgeStars, 1 <= T('common.starsTwoMaxMistakes') ? 2 : 1, 'every socket answered with one mistake');
    assert.equal(r.outcome, 'won'); assert.equal(r.assist, false);
    assert.ok(Number.isFinite(r.score) && Number.isFinite(r.skill) && r.durationMs > 0 && Number.isFinite(r.at), 'numbers');

    const cards = (await personDocs(j, page, 'l1', 'card')).filter((c) => c.concept === 'html.headings');
    assert.equal(cards.length, 1, 'one game card with concept html.headings');
    assert.equal(cards[0].deck, 'games');
    const notes = (await personDocs(j, page, 'l1', 'errorNote')).filter((n) => n.subtopic === 'html.headings');
    assert.equal(notes.length, 1, 'one error note with subtopic html.headings');

    await j.open(page, '/'); // the games screens are drawn as part of the game (D-70), so leave them for the LMS pages
    await nav(page, /^(error notebook|mistakes|my mistakes|notebook)$/i, 'error notebook');
    await waitText(await see(tid(page, 'error-notebook'), 'error-notebook'), /html\.headings/i, 'the error notebook lists html.headings');
    await nav(page, /^(mastery|mastery map|progress|my progress)$/i, 'mastery map');
    await see(tid(page, 'mastery-map'), 'mastery-map');
    const row = await see(tid(page, 'mastery-skill-html.headings'), 'mastery-skill-html.headings', 15_000);
    assert.ok(['not-yet', 'mastered'].includes(await row.getAttribute('data-state')), 'the mastery row has a state');
    await step(page, 'mastery');
  },
});
