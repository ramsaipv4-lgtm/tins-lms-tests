// AC-218 Syntax Drop strike mode: the right key inside the piece's window destroys it and scores; letting a decoy
// through is correct and striking it cracks the shield and is a Knowledge mistake; extra.bpm in stage 3 is >= 1.3 x
// stage 1; the lesson card and the bonus round appear between stages (SPEC-games G6.1; games contract §13.T5;
// AC-218 r3 text). Fixture pack sd-strike: 3 stages of 4 pieces, decoy <h7> on key 4.
// data-testids used: app-ready*, lesson-card
// Seeds: games-base, games-seen.
import { assert, step, see, tid, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, T } from '../lib/games.mjs';

gamesJourney({
  name: 'syntax-drop-strike', acs: ['AC-218'], title: 'strike scores, decoys pass, striking a decoy cracks the shield, speed rises, lesson card and bonus round between stages',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const g = await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-strike', levelId: '1' });
    await g.act('start');
    const bpm = {}; let sawLesson = false; let sawBonus = false; let struckRight = false; let passedDecoy = false; let struckDecoy = false;
    for (let i = 0; i < 3000; i++) {
      let s = await g.state();
      if (s.status === 'won' || s.status === 'lost') break;
      if (s.status === 'paused') {
        if (await tid(page, 'lesson-card').count()) { sawLesson = true; await see(tid(page, 'lesson-card'), 'lesson-card'); await step(page, 'lesson card'); }
        await g.act('continue'); continue;
      }
      if (s.extra.bonus) sawBonus = true;
      if (!s.extra.bonus && bpm[s.stage] === undefined) bpm[s.stage] = s.extra.bpm;
      const off = s.extra.timingOffsetMs || 0;
      const next = [...s.extra.pieces].filter((p) => p.hitAtMs + off >= s.clockMs - T('syntaxDrop.windowPerfectMs')).sort((a, b) => a.hitAtMs - b.hitAtMs)[0];
      if (!next) { await g.advance(50); continue; }
      if (next.decoy) {
        const sh = s.extra.shield; const k = s.knowledgeMistakes; const a = s.actionMisses;
        if (!passedDecoy) {
          s = await g.advanceGame(next.hitAtMs + off + T('syntaxDrop.windowLateMs') + 30 - s.clockMs);
          assert.equal(s.extra.shield, sh, 'letting a decoy pass keeps the shield');
          assert.equal(s.knowledgeMistakes, k, 'letting a decoy pass is not a mistake');
          assert.equal(s.actionMisses, a, 'letting a decoy pass is not an action miss');
          passedDecoy = true; continue;
        }
        if (!struckDecoy) {
          await g.advanceGame(next.hitAtMs + off - s.clockMs);
          await g.act('strike', next.key);
          s = await g.state();
          assert.equal(s.knowledgeMistakes, k + 1, 'striking a decoy is a Knowledge mistake');
          assert.equal(s.extra.shield, sh - T('syntaxDrop.shieldCrack'), 'striking a decoy cracks the shield');
          struckDecoy = true; continue;
        }
        await g.advanceGame(next.hitAtMs + off + T('syntaxDrop.windowLateMs') + 30 - s.clockMs); continue;
      }
      const score0 = s.score;
      await g.advanceGame(next.hitAtMs + off - s.clockMs);
      await g.act('strike', next.key);
      s = await g.state();
      if (!struckRight) {
        assert.ok(s.score > score0, 'the right key scores');
        assert.ok(!s.extra.pieces.some((p) => p.uid === next.uid), 'the struck piece is destroyed');
        struckRight = true;
      }
    }
    assert.ok(struckRight && passedDecoy, 'the round had a right strike and a decoy let through');
    assert.ok(struckDecoy, 'a decoy was struck once');
    assert.ok(sawLesson, 'a lesson card appeared between stages');
    assert.ok(sawBonus, 'a bonus round appeared between stages');
    assert.ok(bpm[1] > 0 && bpm[3] > 0, `bpm recorded for stages 1 and 3 (${JSON.stringify(bpm)})`);
    assert.ok(bpm[3] / bpm[1] >= 1.3, `stage 3 bpm ${bpm[3]} >= 1.3 x stage 1 bpm ${bpm[1]}`);
    await step(page, 'done');
  },
});
