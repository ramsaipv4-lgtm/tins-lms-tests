// AC-239 Syntax Drop rhythm (games contract §13.T5 Syntax Drop; Tuning table §13.T7, read from the SPEC at run time):
// presses 0, 100, 180 and minBeatMs / 2 (250) ms off hitAtMs grade Perfect, Good, Late and miss (graded from the actual offset and the
// Tuning windows); with timingOffsetMs = +80 a press 80 ms after hitAtMs grades Perfect; a calibration whose taps are
// all 60 ms late stores +60 in player.timingOffsetMs, and taps 400 ms late store the clamp; an action miss chips the
// shield and a Knowledge mistake cracks it; shield 0 ends in 'lost'; combo feverCombo starts Fever for feverMs;
// every powerEveryCombo combo grants slowmo, then repair, then echo; TUNING in tuning.ts equals the table.
// Fixture packs: sd-rhythm (60 pieces, no decoys), sd-strike (decoy <h7> on key 4).
// data-testids used: app-ready*, calibration
// Seeds: games-base, games-seen.
import { assert, step, see, tid, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, personDocs, assertTuningTs, quietMoment, T } from '../lib/games.mjs';

const grade = (off) => { const a = Math.abs(off); return a <= T('syntaxDrop.windowPerfectMs') ? 'perfect' : a <= T('syntaxDrop.windowGoodMs') ? 'good' : a <= T('syntaxDrop.windowLateMs') ? 'late' : 'miss'; };
const nextReal = (s) => [...s.extra.pieces].filter((p) => !p.decoy && p.hitAtMs + (s.extra.timingOffsetMs || 0) >= s.clockMs - T('syntaxDrop.windowLateMs')).sort((a, b) => a.hitAtMs - b.hitAtMs)[0];

async function pressAt(g, offsetMs) { // press the next real piece's key offsetMs after its hitAtMs (+ the player's timing offset)
  let s = await g.advanceUntil((x) => x.status === 'playing' && nextReal(x) && nextReal(x).hitAtMs + (x.extra.timingOffsetMs || 0) + offsetMs >= x.clockMs, 'a piece to strike');
  const p = nextReal(s); const tOff = s.extra.timingOffsetMs || 0;
  s = await g.advanceGame(p.hitAtMs + tOff + offsetMs - s.clockMs);
  const actual = s.clockMs - p.hitAtMs - tOff;
  const before = s;
  await g.act('strike', p.key);
  return { before, after: await g.state(), actual, piece: p };
}

gamesJourney({
  name: 'rhythm-windows', acs: ['AC-239'], title: 'timing grades, shield chip and crack, lost at 0, Fever and power-ups; TUNING equals the SPEC table',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'), timeoutMs: 170_000,
  async run(j) {
    await assertTuningTs('syntaxDrop.');
    const page = await j.actor('learner', P.l1);
    let g = await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-rhythm', levelId: '1' });
    await g.act('start');
    // the miss press sits halfway between two beats (minBeatMs / 2 = 250 ms by default), so no other piece is in its window
    const missAt = T('syntaxDrop.minBeatMs') / 2;
    assert.ok(missAt > T('syntaxDrop.windowLateMs') && T('syntaxDrop.minBeatMs') - missAt > T('syntaxDrop.windowLateMs'), 'Tuning: minBeatMs / 2 lies outside the Late window of both neighbouring beats');
    for (const off of [0, 100, 180, missAt]) {
      const { before, after, actual } = await pressAt(g, off);
      const want = grade(actual);
      assert.equal(after.extra.lastGrade, want, `a press ${actual} ms off grades ${want}`);
      if (want === 'miss') assert.equal(after.extra.shield, before.extra.shield - T('syntaxDrop.shieldChip'), 'an action miss chips the shield');
    }
    await step(page, 'grades');
    // Fever and power-ups: perfect presses from here
    let sawFever = false; const powers = [];
    for (let i = 0; i < 60; i++) {
      const s0 = await g.state();
      if (s0.status !== 'playing') break;
      const { after } = await pressAt(g, 0);
      if (after.extra.combo >= T('syntaxDrop.feverCombo') && after.extra.fever) {
        if (!sawFever) assert.ok(Math.abs(after.extra.fever.untilMs - after.clockMs - T('syntaxDrop.feverMs')) <= 50, 'Fever lasts syntaxDrop.feverMs');
        sawFever = true;
      }
      powers.splice(0, powers.length, ...after.extra.powers); // held power-ups accumulate (none is used here)
      if (powers.length >= 3) break;
    }
    assert.ok(sawFever, `Fever starts at combo ${T('syntaxDrop.feverCombo')}`);
    assert.deepEqual(powers.slice(0, 3), ['slowmo', 'repair', 'echo'], 'power-ups come in the fixed order');
    await step(page, 'fever and power-ups');

    // crack on a Knowledge mistake (sd-strike decoy), then chips until the shield breaks
    g = await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-strike', levelId: '1' });
    await g.act('start');
    let s = await g.advanceUntil((x) => x.status === 'playing' && x.extra.pieces.some((p) => p.decoy), 'a decoy');
    const d = s.extra.pieces.find((p) => p.decoy);
    s = await g.advanceGame(d.hitAtMs - s.clockMs);
    const sh = s.extra.shield;
    await g.act('strike', d.key);
    s = await g.state();
    assert.equal(s.extra.shield, sh - T('syntaxDrop.shieldCrack'), 'a Knowledge mistake cracks the shield');
    for (let i = 0; i < 80 && s.status !== 'lost' && s.status !== 'won'; i++) { // presses with nothing in any window
      if (s.status === 'paused') { await g.act('continue'); s = await g.state(); continue; }
      if (!s.extra.pieces.length) { s = await g.advance(50); continue; }
      await quietMoment(g);
      await g.act('strike', '3');
      s = await g.state();
    }
    assert.equal(s.status, 'lost', 'shield 0 ends the round in lost');
    await step(page, 'lost');
  },
});

gamesJourney({
  name: 'rhythm-calibration', acs: ['AC-239'], title: 'calibration stores the median offset, clamped; the offset moves the windows',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    for (const [late, want] of [[60, 60], [400, T('syntaxDrop.calibrationMaxOffsetMs')]]) {
      const g = await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-rhythm', levelId: '1' });
      await g.act('calibrate');
      await see(tid(page, 'calibration'), 'calibration panel');
      let s = await g.state();
      const beats = s.extra.calibration.beatsAtMs;
      assert.equal(beats.length, T('syntaxDrop.calibrationBeats'), 'syntaxDrop.calibrationBeats beats');
      let t = 0;
      for (const b of beats) { await g.advance(b + late - t); t = b + late; await g.act('tap'); }
      s = await g.advanceUntil((x) => x.extra.calibration?.done || x.extra.calibration === null, 'calibration done', { stepMs: 100, maxMs: 5000 });
      assert.equal(s.extra.timingOffsetMs, want, `taps ${late} ms late store ${want}`);
      const p = (await personDocs(j, page, 'l1', 'player'))[0];
      assert.equal(p?.timingOffsetMs, want, 'player.timingOffsetMs is saved');
      await step(page, `calibrated ${want}`);
    }
    const g = await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-rhythm', levelId: '1' });
    await g.act('offset', 80);
    assert.equal((await g.state()).extra.timingOffsetMs, 80, 'offset set to +80');
    await g.act('start');
    let s = await g.advanceUntil((x) => x.status === 'playing' && nextReal(x), 'a piece');
    const p = nextReal(s);
    s = await g.advanceGame(p.hitAtMs + 80 - s.clockMs);
    await g.act('strike', p.key);
    assert.equal((await g.state()).extra.lastGrade, 'perfect', 'with offset +80 a press 80 ms after hitAtMs is Perfect');
  },
});
