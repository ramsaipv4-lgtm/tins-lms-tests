// AC-231 Prologue, AC-232 front intro and chapter end, AC-233 story controls (games contract D-G20, §13.T1 statuses,
// scenes, story actions; story text keys live in en.json).
// - AC-231: the first visit to /learn/games plays the prologue (__game.id 'prologue', status 'story'); its avatar beat
//   saves player.avatar; skipping opens the arcade and sets player.seen.prologue; a later visit (after reload) does not
//   play it; "Story so far" replays it.
// - AC-232: a game's first launch plays <gameId>.intro before the title and the second launch does not; winning a
//   pack's last level writes the result, then plays <gameId>.chapter-end; during any scene clockMs does not move.
// - AC-233: next (N) advances extra.scene.line and skip (F) ends the scene, by keyboard only and by buttons only
//   (act-next, act-skip); Escape pauses a scene; replay plays a seen scene again; ?story=off plays no scene and sets no
//   seen flag.
// data-testids used: app-ready*, story-scene, story-line, avatar-choice, story-replay, story-replay-<sceneId>,
//   act-next, act-skip, act-replay-<sceneId>, game-tile-<gameId>
// Seeds: games-base (nobody has seen any scene).
import { assert, step, see, tid, wait, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, gameUrl, G, personDocs, idsOf, playWhack, controller, ownPack } from '../lib/games.mjs';

const playerOf = async (j, page, key) => (await personDocs(j, page, key, 'player'))[0];
async function untilScene(g, what, timeout = 30_000) { return g.waitFor((s) => s && s.status === 'story' && s.extra?.scene, what, timeout); }

gamesJourney({
  name: 'story-prologue', acs: ['AC-231'], title: 'the prologue plays once, saves the avatar, can be skipped and replayed',
  seeds: ['games-base'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: '/learn/games?clock=manual' });
    const g = G(page);
    let s = await untilScene(g, 'the prologue');
    assert.equal(await g.id(), 'prologue', "__game.id is 'prologue'");
    assert.equal(s.extra.scene.id, 'prologue');
    await see(tid(page, 'story-scene'), 'story-scene');
    for (let i = 0; i < 200 && !(await tid(page, 'avatar-choice').count()); i++) { await g.act('next'); await g.advance(500); }
    await see(tid(page, 'avatar-choice'), 'avatar-choice (the avatar beat)');
    await g.act('avatar', { look: 'block', color: 'teal', nameTag: 'Lena' });
    await step(page, 'avatar chosen');
    await g.act('skip');
    await see(page.locator('[data-testid^="game-tile-"]'), 'the arcade after the prologue', 15_000);
    assert.equal(await page.evaluate(() => typeof window.__game), 'undefined', 'the prologue is unmounted');
    const p = await playerOf(j, page, 'l1');
    assert.equal(p?.seen?.prologue, true, 'player.seen.prologue is set');
    assert.equal(p?.avatar?.nameTag, 'Lena', 'the avatar choice is saved');
    await page.reload();
    await see(page.locator('[data-testid^="game-tile-"]'), 'the arcade on a later visit', 20_000);
    await wait(1500);
    assert.notEqual(await g.id().catch(() => null), 'prologue', 'the prologue does not play again');
    await (await see(tid(page, 'story-replay'), 'story-replay ("Story so far")')).click();
    await (await see(tid(page, 'act-replay-prologue'), 'act-replay-prologue')).click();
    s = await untilScene(g, 'the replayed prologue');
    assert.equal(s.extra.scene.id, 'prologue', 'the prologue replays');
    await g.act('skip');
    await step(page, 'replayed');
  },
});

gamesJourney({
  name: 'story-intro-chapter', acs: ['AC-232'], title: 'front intro on first launch only; chapter-end after the last level; scenes stop the play clock',
  seeds: ['games-base'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: '/learn/games?story=off' });
    await j.open(page, gameUrl('whack-a-bug', 'wb-loops', '1', { story: true }));
    const g = G(page);
    let s = await untilScene(g, 'the whack-a-bug intro');
    assert.equal(s.extra.scene.id, 'whack-a-bug.intro', 'the front intro plays on the first launch');
    const c0 = s.clockMs;
    s = await g.advance(2000);
    assert.equal(s.clockMs, c0, 'the play clock does not move during a scene');
    await g.act('skip');
    s = await g.waitFor((x) => x.status === 'title', 'the title after the intro');
    await step(page, 'intro skipped');
    await j.open(page, gameUrl('whack-a-bug', 'wb-loops', '1', { story: true }));
    s = await g.waitFor((x) => x && ['title', 'story'].includes(x.status), 'the second launch');
    assert.equal(s.status, 'title', 'no intro on the second launch');

    const pack = ownPack('whack-a-bug', 'wb-loops');
    const last = pack.levels[pack.levels.length - 1];
    const before = idsOf(await personDocs(j, page, 'l1', 'gameResult'));
    await j.open(page, gameUrl('whack-a-bug', 'wb-loops', last.id, { story: true }));
    await g.waitFor((x) => x && x.status === 'title', 'the last level');
    await g.act('start');
    s = await playWhack(page, controller(page, 'whack-a-bug', 'act'), last, { stopWhen: (x) => x.status === 'story' || x.status === 'won' || x.status === 'lost' });
    assert.equal(s.status, 'story', 'winning the last level of the pack plays a scene');
    assert.equal(s.extra.scene.id, 'whack-a-bug.chapter-end', 'the chapter-end scene');
    const fresh = (await personDocs(j, page, 'l1', 'gameResult')).filter((d) => !before.has(d._id || d.id));
    assert.equal(fresh.length, 1, 'the result is written before the chapter-end scene');
    const c1 = s.clockMs;
    s = await g.advance(3000);
    assert.equal(s.clockMs, c1, 'the play clock does not move during the chapter-end scene');
    await g.act('skip');
    s = await g.waitFor((x) => x.status === 'won', 'the results after the chapter end');
    await step(page, 'chapter end');
  },
});

gamesJourney({
  name: 'story-controls', acs: ['AC-233'], title: 'next and skip by keyboard and by buttons; Escape pauses a scene; replay; story=off',
  seeds: ['games-base'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: '/learn/games?story=off' });
    const g = G(page);
    // keyboard only: sniper intro
    await j.open(page, gameUrl('sniper', 'sn-basics', '1', { story: true }));
    let s = await untilScene(g, 'the sniper intro');
    let line0 = s.extra.scene.line; let beat0 = s.extra.scene.beat;
    for (let i = 0; i < 20 && !s.extra.scene.line; i++) s = await g.advance(500);
    line0 = s.extra.scene.line; beat0 = s.extra.scene.beat;
    await page.keyboard.press('n');
    s = await g.state();
    assert.ok(s.extra.scene && (s.extra.scene.line !== line0 || s.extra.scene.beat !== beat0), 'N advances the dialogue');
    await page.keyboard.press('Escape');
    assert.equal((await g.state()).status, 'paused', 'Escape pauses a scene');
    await page.keyboard.press('p');
    assert.equal((await g.state()).status, 'story', 'P resumes the scene');
    await page.keyboard.press('f');
    s = await g.waitFor((x) => x.status === 'title', 'F skips to the title');
    await step(page, 'keyboard');
    // buttons only: aftershock intro
    await j.open(page, gameUrl('aftershock', 'as-area', '1', { story: true }));
    s = await untilScene(g, 'the aftershock intro');
    for (let i = 0; i < 20 && !s.extra.scene.line; i++) s = await g.advance(500);
    line0 = s.extra.scene.line; beat0 = s.extra.scene.beat;
    await (await see(tid(page, 'story-line'), 'story-line')).isVisible();
    await (await see(tid(page, 'act-next'), 'act-next')).click();
    s = await g.state();
    assert.ok(s.extra.scene.line !== line0 || s.extra.scene.beat !== beat0, 'act-next advances the dialogue');
    await (await see(tid(page, 'act-skip'), 'act-skip')).click();
    await g.waitFor((x) => x.status === 'title', 'act-skip skips to the title');
    // replay from the title / pause menu
    await (await see(tid(page, 'act-replay-aftershock.intro'), 'act-replay-aftershock.intro')).click();
    s = await untilScene(g, 'the replayed intro');
    assert.equal(s.extra.scene.id, 'aftershock.intro', 'replay plays the seen scene again');
    await g.act('skip');
    await step(page, 'buttons');
    // story=off: no scene, no seen flag
    await j.open(page, gameUrl('syntax-drop', 'sd-strike', '1'));
    s = await g.waitFor((x) => x && x.status !== undefined, 'syntax-drop with story=off');
    assert.equal(s.status, 'title', 'story=off plays no intro');
    const p = (await personDocs(j, page, 'l1', 'player'))[0];
    assert.ok(!p?.seen?.intro?.['syntax-drop'], 'story=off sets no seen flag');
  },
});
