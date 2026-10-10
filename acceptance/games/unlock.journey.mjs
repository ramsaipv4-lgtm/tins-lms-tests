// AC-255 Levels open in order (SPEC D-78): in a fresh pack only level 1 is open; the game page shows levels 2 and 3
// locked with their unlock lines and their deep links show game-unavailable; winning level 1 opens level 2 and not
// level 3; with the class switch games.unlockAll on (§4.27, class layer), every level of the pack is open.
// Vehicle: Syntax Drop sd-path (3 levels) for learner l3, who has never played it. Seeds: games-hub (clock day 9);
// games-hub-unlockall (the same with class c1 switches { "games.unlockAll": true }).
// data-testids used: app-ready*, game-page-<gameId>, game-pack-<packId>, game-level-<levelId> (data-locked),
//   game-level-unlock-<levelId>, game-unavailable
import { assert, step, see, tid, P } from '../journeys/_harness.mjs';
import { join } from 'node:path';
import { gamesJourney, dayAt, gameUrl, openGame, controller, playSyntaxDrop, readJson, GFIX } from '../lib/games.mjs';

const hubPackLevel = (packId, levelId) => readJson(join(GFIX, 'packs', 'hub', 'syntax-drop', `${packId}.json`)).levels.find((l) => String(l.id) === levelId);

const PATH = '/learn/games/syntax-drop?story=off';
async function levelStates(page) {
  await see(tid(page, 'game-page-syntax-drop'), 'game-page-syntax-drop', 20_000);
  await (await see(tid(page, 'game-pack-sd-path'), 'game-pack-sd-path')).click();
  await see(tid(page, 'game-level-3'), 'game-level-3 in the level path');
  const out = {};
  for (const id of ['1', '2', '3']) out[id] = (await tid(page, `game-level-${id}`).first().getAttribute('data-locked')) === 'true';
  return out;
}
async function deepLinkOpens(j, page, levelId) {
  await j.open(page, gameUrl('syntax-drop', 'sd-path', levelId));
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    if (await tid(page, 'game-unavailable').count() && await tid(page, 'game-unavailable').first().isVisible()) return false;
    if (await page.evaluate(() => { try { return window.__game?.state().status === 'title'; } catch { return false; } })) return true;
    await page.waitForTimeout(200);
  }
  throw new Error(`level ${levelId}: neither the title nor game-unavailable appeared`);
}
gamesJourney({
  name: 'unlock', acs: ['AC-255'], title: 'only level 1 open in a fresh pack; winning level 1 opens level 2 and not level 3',
  seeds: ['games-hub'], clock: dayAt(9, '10:00'), timeoutMs: 150_000,
  async run(j) {
    const page = await j.actor('learner', P.l3, { path: PATH });
    let locked = await levelStates(page);
    assert.deepEqual(locked, { 1: false, 2: true, 3: true }, 'a fresh pack: only level 1 is open');
    for (const id of ['2', '3']) assert.ok((await (await see(tid(page, `game-level-unlock-${id}`), `game-level-unlock-${id}`)).innerText()).trim().length > 0, `level ${id} shows its unlock line`);
    await step(page, 'fresh pack');
    assert.equal(await deepLinkOpens(j, page, '2'), false, 'the deep link to level 2 shows game-unavailable');
    assert.equal(await deepLinkOpens(j, page, '3'), false, 'the deep link to level 3 shows game-unavailable');
    // win level 1 (sd-path levels are short strike levels, like sd-strike)
    await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-path', levelId: '1' });
    const s = await playSyntaxDrop(page, controller(page, 'syntax-drop', 'act'), hubPackLevel('sd-path', '1'));
    assert.equal(s.status, 'won', 'level 1 won');
    await j.open(page, PATH);
    locked = await levelStates(page);
    assert.deepEqual(locked, { 1: false, 2: false, 3: true }, 'winning level 1 opens level 2 and not level 3');
    assert.equal(await deepLinkOpens(j, page, '2'), true, 'level 2 opens by deep link');
    assert.equal(await deepLinkOpens(j, page, '3'), false, 'level 3 still shows game-unavailable');
    await step(page, 'level 2 open');
  },
});

gamesJourney({
  name: 'unlock-all', acs: ['AC-255'], title: 'with games.unlockAll on for the class every level of the pack is open',
  seeds: ['games-hub-unlockall'], clock: dayAt(9, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l3, { path: PATH });
    const locked = await levelStates(page);
    assert.deepEqual(locked, { 1: false, 2: false, 3: false }, 'every level is open with games.unlockAll');
    assert.equal(await deepLinkOpens(j, page, '3'), true, 'the deep link to level 3 opens the game');
    await step(page, 'all open');
  },
});
