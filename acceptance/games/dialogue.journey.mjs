// AC-251 The dialogue bar (SPEC §13.3 "Shared screens" and "Scene state and timing"): in a scene the bar shows
// act-previous, act-next, act-pause, act-autoplay (aria-pressed) and act-skip; previous goes back to the previous say
// line and returns false on the first; next advances; pause stops the scene and resume returns to it; autoplay toggles
// player.settings.autoAdvance in the player document and, while on, a say line advances after story.sayNominalMs of
// scene time (and not before); a tap on the scene outside the buttons is next; skip ends the scene. Keys B and A too.
// Vehicle: the syntax-drop intro on its first launch (story on, clock=manual). Seeds: games-base (no scene seen).
// data-testids used: app-ready*, story-scene, story-line, act-previous, act-next, act-pause, act-resume, act-autoplay,
//   act-skip
import { assert, step, see, tid, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, gameUrl, G, personDocs, T } from '../lib/games.mjs';

gamesJourney({
  name: 'dialogue', acs: ['AC-251'], title: 'previous, next, pause, autoplay kept in the player document, skip, tap = next',
  seeds: ['games-base'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: '/learn/games?story=off' });
    await j.open(page, gameUrl('syntax-drop', 'sd-strike', '1', { story: true }));
    const g = G(page);
    let s = await g.waitFor((x) => x && x.status === 'story' && x.extra?.scene, 'the syntax-drop intro', 30_000);
    for (let i = 0; i < 20 && !s.extra.scene.line; i++) s = await g.advance(500);
    assert.ok(s.extra.scene.line, 'the scene reaches a say line');
    for (const id of ['act-previous', 'act-next', 'act-pause', 'act-autoplay', 'act-skip']) await see(tid(page, id), `${id} in the dialogue bar`);
    const first = s.extra.scene.line;
    assert.equal(await g.act('previous'), false, 'previous on the first say line does nothing and returns false');
    await (await see(tid(page, 'act-next'), 'act-next')).click();
    s = await g.state();
    for (let i = 0; i < 20 && (!s.extra.scene.line || s.extra.scene.line === first); i++) s = await g.advance(500);
    const second = s.extra.scene.line;
    assert.ok(second && second !== first, 'next moves to another say line');
    await (await see(tid(page, 'act-previous'), 'act-previous')).click();
    assert.equal((await g.state()).extra.scene.line, first, 'previous shows the previous say line again');
    await page.keyboard.press('n');
    await g.advanceUntil((x) => x.extra.scene?.line === second, 'back on the second line', { stepMs: 200, maxMs: 10_000 });
    await page.keyboard.press('b');
    assert.equal((await g.state()).extra.scene.line, first, 'B is previous');
    await step(page, 'previous and next');
    // pause and resume
    await (await see(tid(page, 'act-pause'), 'act-pause')).click();
    assert.equal((await g.state()).status, 'paused', 'act-pause pauses the scene');
    await (await see(tid(page, 'act-resume'), 'act-resume')).click();
    assert.equal((await g.state()).status, 'story', 'resume returns to the scene');
    // autoplay
    const btn = await see(tid(page, 'act-autoplay'), 'act-autoplay');
    assert.equal(await btn.getAttribute('aria-pressed'), 'false', 'autoplay is off by default');
    await btn.click();
    assert.equal(await tid(page, 'act-autoplay').getAttribute('aria-pressed'), 'true', 'aria-pressed shows autoplay on');
    const p = (await personDocs(j, page, 'l1', 'player'))[0];
    assert.equal(p?.settings?.autoAdvance, true, 'autoplay is kept in player.settings.autoAdvance');
    const nominal = T('story.sayNominalMs');
    const moved = (l, b) => (x) => x.status !== 'story' || (x.extra.scene.line && (x.extra.scene.line !== l || x.extra.scene.beat !== b));
    s = await g.state();
    s = await g.advanceUntil(moved(s.extra.scene.line, s.extra.scene.beat), 'autoplay to advance the current line', { stepMs: 100, maxMs: nominal + 15_000 });
    if (s.status === 'story') { // time the next line from its start: not before story.sayNominalMs, soon after it
      const line0 = s.extra.scene.line; const beat0 = s.extra.scene.beat;
      s = await g.advance(Math.max(50, nominal - 300));
      assert.equal(s.extra.scene.line, line0, 'autoplay waits story.sayNominalMs before advancing a line');
      s = await g.advanceUntil(moved(line0, beat0), 'autoplay to advance after story.sayNominalMs', { stepMs: 100, maxMs: 2000 });
    }
    if ((await g.state()).status !== 'story') { // the scene ended under autoplay: replay it for the rest
      await (await see(tid(page, 'act-replay-syntax-drop.intro'), 'act-replay-syntax-drop.intro')).click();
      await g.waitFor((x) => x.status === 'story', 'the replayed intro');
    }
    await page.keyboard.press('a');
    assert.equal(await tid(page, 'act-autoplay').getAttribute('aria-pressed'), 'false', 'A turns autoplay off');
    assert.equal((await personDocs(j, page, 'l1', 'player'))[0]?.settings?.autoAdvance, false, 'autoplay off is kept in the player document');
    await step(page, 'autoplay');
    // a tap on the scene outside the buttons is next
    s = await g.state();
    if (s.status === 'story') {
      for (let i = 0; i < 20 && !s.extra.scene.line; i++) s = await g.advance(500);
      const before = [s.extra.scene.line, s.extra.scene.beat];
      const box = await (await see(tid(page, 'story-scene'), 'story-scene')).boundingBox();
      await page.mouse.click(box.x + 12, box.y + 12);
      s = await g.state();
      assert.ok(s.status !== 'story' || s.extra.scene.line !== before[0] || s.extra.scene.beat !== before[1], 'a tap on the scene is next');
    }
    if ((await g.state()).status === 'story') await (await see(tid(page, 'act-skip'), 'act-skip')).click();
    await g.waitFor((x) => x.status === 'title', 'skip ends the scene');
  },
});
