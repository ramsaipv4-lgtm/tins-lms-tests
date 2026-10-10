// AC-248 "Recommended for you" puts the learner's weakest concept first (SPEC §13.3 Home row 2; mastery §4.4): after
// l1 plays sd-fill with one Knowledge mistake (the concept of the dropped decoy scores 0) and sd-strike with none,
// the first card of hub-row-recommended is a pack with sockets of that weakest concept (sd-fill: no other released
// pack has css.* sockets), the row has at most 12 cards, and every card is the learner's own (no other learner's data).
// Seeds: games-base, games-seen. Vehicle: Syntax Drop.
// data-testids used: app-ready*, hub-row-recommended, hub-card-<gameId>-<packId>
import { assert, step, see, tid, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playSyntaxDrop, ownPack, personDocs, idsOf, waitNewResult } from '../lib/games.mjs';

const CARD = '[data-testid^="hub-card-"]:not([data-testid="hub-card-thumb"]):not([data-testid="hub-card-unlock"])';

gamesJourney({
  name: 'hub-recommended', acs: ['AC-248'], title: 'Recommended for you starts with a pack for the weakest concept',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 150_000,
  async run(j) {
    const page = await j.actor('learner', P.l1);
    let before = idsOf(await personDocs(j, page, 'l1', 'gameResult'));
    await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-fill', levelId: '1' });
    let s = await playSyntaxDrop(page, controller(page, 'syntax-drop', 'act'), ownPack('syntax-drop', 'sd-fill').levels[0], { wrongOnce: true });
    assert.equal(s.status, 'won');
    const [r1] = await waitNewResult(j, page, 'l1', before);
    assert.equal(r1.mistakes.length, 1, 'one Knowledge mistake in sd-fill');
    const weakest = r1.mistakes[0].concept;
    before = idsOf(await personDocs(j, page, 'l1', 'gameResult'));
    await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-strike', levelId: '1' });
    s = await playSyntaxDrop(page, controller(page, 'syntax-drop', 'act'), ownPack('syntax-drop', 'sd-strike').levels[0]);
    assert.equal(s.status, 'won');
    const [r2] = await waitNewResult(j, page, 'l1', before);
    assert.equal(r2.mistakes.length, 0, 'no mistakes in sd-strike');
    await step(page, `weakest ${weakest}`);

    await j.open(page, '/learn/games?story=off');
    const row = await see(tid(page, 'hub-row-recommended'), 'hub-row-recommended', 20_000);
    const cards = await row.locator(CARD).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    assert.ok(cards.length >= 1 && cards.length <= 12, `1 to 12 recommended cards (got ${cards.length})`);
    assert.equal(cards[0], 'hub-card-syntax-drop-sd-fill', `the first recommended card is for ${weakest}, the weakest concept (got ${cards.join(', ')})`);
    await step(page, 'recommended');
  },
});
