// AC-250 A way out in every status (SPEC §13.3 "Shared screens", common actions retry R, back Backspace, quit Q): the
// title has act-start and act-back; playing has act-pause; the pause menu has resume, retry, back and quit; a scene has
// act-skip and act-pause; results after a win and after a loss have act-retry (the same level again), act-back (the
// game page /learn/games/<gameId>) and act-quit (Home /learn/games); the keys R, Backspace and Q do the same.
// Vehicle: Syntax Drop sd-strike (clock=manual). A loss comes from presses with no piece in any window, which chip the
// shield to 0. Seeds: games-base, games-seen; one launch with story on for the scene check (the intro is seen, so the
// scene is a replay of syntax-drop.intro).
// data-testids used: app-ready*, act-start, act-back, act-pause, act-resume, act-retry, act-quit, act-skip,
//   act-replay-<sceneId>, pause-menu, game-results, game-page-<gameId>, hub-row-games
import { assert, step, see, tid, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playSyntaxDrop, ownPack, quietMoment, G } from '../lib/games.mjs';

const lvl = ownPack('syntax-drop', 'sd-strike').levels[0];
const visible = async (page, id) => { await see(tid(page, id), id, 10_000); };
async function lose(g) {
  let s = await g.state();
  if (s.status === 'title') { await g.act('start'); s = await g.state(); }
  for (let i = 0; i < 200 && s.status !== 'lost'; i++) {
    if (s.status === 'paused') { await g.act('continue'); s = await g.state(); continue; }
    if (!s.extra.pieces.length) { s = await g.advance(50); continue; }
    await quietMoment(g); await g.act('strike', '9'); s = await g.state();
  }
  assert.equal(s.status, 'lost', 'the round is lost (shield 0)');
  return s;
}
async function win(page) {
  const s = await playSyntaxDrop(page, controller(page, 'syntax-drop', 'act'), lvl);
  assert.equal(s.status, 'won', 'the round is won');
  return s;
}
const atGamePage = async (page) => { await page.waitForURL(/\/learn\/games\/syntax-drop(\?.*)?$/, { timeout: 15_000 }); await see(tid(page, 'game-page-syntax-drop'), 'the game page'); };
const atHome = async (page) => { await page.waitForURL(/\/learn\/games\/?(\?.*)?$/, { timeout: 15_000 }); await see(tid(page, 'hub-row-games'), 'Home'); };
const open = (j, page) => openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-strike', levelId: '1' });

gamesJourney({
  name: 'way-out-buttons', acs: ['AC-250'], title: 'title, playing, pause menu and a scene each have a way out; after a win the result buttons work',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 150_000,
  async run(j) {
    const page = await j.actor('learner', P.l1);
    let g = await open(j, page);
    await visible(page, 'act-start'); await visible(page, 'act-back');
    await (await see(tid(page, 'act-start'), 'act-start')).click();
    await visible(page, 'act-pause');
    await (await see(tid(page, 'act-pause'), 'act-pause')).click();
    await visible(page, 'pause-menu');
    for (const id of ['act-resume', 'act-retry', 'act-back', 'act-quit']) await visible(page, id);
    await (await see(tid(page, 'act-back'), 'act-back')).click();
    await atGamePage(page);
    assert.equal(await page.evaluate(() => typeof window.__game), 'undefined', 'back destroys the game');
    await step(page, 'title, playing, pause');
    // a scene: replay the intro from the title, then its way out
    g = await open(j, page);
    await (await see(tid(page, 'act-replay-syntax-drop.intro'), 'act-replay-syntax-drop.intro')).click();
    await g.waitFor((x) => x.status === 'story', 'the replayed intro');
    await visible(page, 'act-skip'); await visible(page, 'act-pause');
    await (await see(tid(page, 'act-skip'), 'act-skip')).click();
    await g.waitFor((x) => x.status === 'title', 'act-skip leaves the scene');
    // after a win: retry, back, quit
    await win(page);
    await see(tid(page, 'game-results'), 'game-results');
    for (const id of ['act-retry', 'act-back', 'act-quit']) await visible(page, id);
    await (await see(tid(page, 'act-retry'), 'act-retry')).click();
    let s = await g.waitFor((x) => x && ['title', 'playing'].includes(x.status), 'the same level again');
    assert.equal(String(s.levelId), '1', 'retry plays the same level');
    assert.ok(s.clockMs < 1000, 'retry starts the level again');
    await win(page);
    await (await see(tid(page, 'act-back'), 'act-back')).click();
    await atGamePage(page);
    g = await open(j, page);
    await win(page);
    await (await see(tid(page, 'act-quit'), 'act-quit')).click();
    await atHome(page);
    await step(page, 'after a win');
  },
});

gamesJourney({
  name: 'way-out-keys', acs: ['AC-250'], title: 'after a loss the result buttons and the keys R, Backspace and Q work',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 150_000,
  async run(j) {
    const page = await j.actor('learner', P.l1);
    let g = await open(j, page);
    await lose(g);
    await see(tid(page, 'game-results'), 'game-results after a loss');
    for (const id of ['act-retry', 'act-back', 'act-quit']) await visible(page, id);
    await page.keyboard.press('r');
    let s = await g.waitFor((x) => x && ['title', 'playing'].includes(x.status), 'R retries');
    assert.equal(String(s.levelId), '1', 'R plays the same level');
    await lose(g);
    await page.keyboard.press('Backspace');
    await atGamePage(page);
    g = await open(j, page);
    await lose(g);
    await page.keyboard.press('q');
    await atHome(page);
    await step(page, 'keys after a loss');
    g = await open(j, page);
    await lose(g);
    await (await see(tid(page, 'act-back'), 'act-back')).click();
    await atGamePage(page);
    g = await open(j, page);
    await win(page);
    await page.keyboard.press('r');
    s = await g.waitFor((x) => x && ['title', 'playing'].includes(x.status), 'R after a win');
    await page.keyboard.press('Escape');
    assert.equal((await g.state()).status, s.status === 'playing' ? 'paused' : s.status, 'Escape pauses while playing');
    if ((await g.state()).status === 'paused') { await page.keyboard.press('q'); await atHome(page); }
    await step(page, 'done');
  },
});
