// AC-236 Progression persists (games contract D-G21, §13.T6): XP and coins earned in a round equal the Tuning formula
// (xp = round(skill / common.xpSkillDivisor) + common.xpPerStar x knowledgeStars; coins = common.coinsPerStar x
// knowledgeStars + floor(skill / common.coinsSkillDivisor) + golden coins), appear in player-xp / player-coins, and are
// unchanged after a reload, after signing out and in, and in a second browser context; player.xp and player.coins
// equal the totals over gameResults and purchases.
// Vehicle: Syntax Drop sd-strike (SPEC §13.10). Seed games-player: l1 has results worth xp 200 and coins 65, no purchases.
// data-testids used: app-ready*, player-xp, player-coins
import { assert, step, see, tid, waitText, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playSyntaxDrop, ownPack, personDocs, idsOf, waitNewResult, arcadeUrl, T } from '../lib/games.mjs';

const num = (t) => Number(String(t).replace(/[^\d-]/g, ''));
async function shown(page) {
  const xp = num(await (await see(tid(page, 'player-xp'), 'player-xp', 20_000)).innerText());
  const coins = num(await (await see(tid(page, 'player-coins'), 'player-coins')).innerText());
  return { xp, coins };
}

gamesJourney({
  name: 'player', acs: ['AC-236'], title: 'XP and coins follow the formula and persist across reload, sign-out and devices',
  seeds: ['games-base', 'games-seen', 'games-player'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: arcadeUrl() });
    assert.deepEqual(await shown(page), { xp: 200, coins: 65 }, 'the seeded totals are shown');
    const before = idsOf(await personDocs(j, page, 'l1', 'gameResult'));
    await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-strike', levelId: '1' });
    const s = await playSyntaxDrop(page, controller(page, 'syntax-drop', 'act'), ownPack('syntax-drop', 'sd-strike').levels[0]);
    assert.equal(s.status, 'won');
    const [r] = await waitNewResult(j, page, 'l1', before);
    const xp = Math.round(r.skill / T('common.xpSkillDivisor')) + T('common.xpPerStar') * r.knowledgeStars;
    const golden = r.coins - (T('common.coinsPerStar') * r.knowledgeStars + Math.floor(r.skill / T('common.coinsSkillDivisor')));
    assert.equal(r.xp, xp, 'gameResult.xp follows the formula');
    assert.equal(golden, 0, 'gameResult.coins follows the formula (Syntax Drop has no golden critters)');
    const want = { xp: 200 + r.xp, coins: 65 + r.coins };
    const results = await personDocs(j, page, 'l1', 'gameResult');
    const player = (await personDocs(j, page, 'l1', 'player'))[0];
    assert.equal(player.xp, results.reduce((n, x) => n + x.xp, 0), 'player.xp = sum of gameResult.xp');
    assert.equal(player.coins, results.reduce((n, x) => n + x.coins, 0) - (player.purchases || []).reduce((n, p) => n + p.price, 0), 'player.coins = results - purchases');
    await j.open(page, arcadeUrl());
    assert.deepEqual(await shown(page), want, 'the arcade shows the new totals');
    await page.reload();
    assert.deepEqual(await shown(page), want, 'unchanged after a reload');
    await step(page, 'after reload');
    const out = await page.context().request.post(`${j.url}/api/signout`);
    assert.ok(out.ok(), 'signed out');
    await j.relogin(page, P.l1);
    await j.open(page, arcadeUrl());
    assert.deepEqual(await shown(page), want, 'unchanged after signing out and in');
    const other = await j.actor('learner-device-2', P.l1, { path: arcadeUrl() });
    assert.deepEqual(await shown(other), want, 'the same totals on a second device');
    await step(other, 'second device');
  },
});
