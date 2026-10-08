// AC-201 2D frame rate (SPEC-games G2; AC-201 r3 text): on the low-end phone profile (360x740, 4x CPU slowdown) each
// first-wave 2D game, played by the suite's driver for 20 s of real time with story=off at the last level of its
// sample pack (games contract Appendix G-D), reports frameP50 <= 20 ms and frameP95 <= 34 ms from __game.stats().
// Raid joins with its own contract. Claimed by the last first-wave game to merge (D-G24); each game task runs its part.
// data-testids used: app-ready*, game-canvas
// Seeds: games-base, games-samples (D-G18 samplePacks), games-sniper-rank (unlocks the boss-recursion boss level).
import { assert, step } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, keepBusy, samplePack, G, tid, see } from '../lib/games.mjs';
import { at, P } from '../journeys/_harness.mjs';

const RUNS = [
  { gameId: 'syntax-drop', packId: 'html-headings' },
  { gameId: 'whack-a-bug', packId: 'dsa-bugs' },
  { gameId: 'aftershock', packId: 'dsa-order' },
  { gameId: 'sniper', packId: 'boss-recursion' },
];

for (const r of RUNS) {
  gamesJourney({
    name: `perf2d-${r.gameId}`, acs: ['AC-201'], title: `${r.gameId}: 20 s of play at the last level of ${r.packId}, p50 <= 20 ms and p95 <= 34 ms`,
    profiles: ['phone'], seeds: ['games-base', 'games-samples', ...(r.gameId === 'sniper' ? ['games-sniper-rank'] : [])], clock: at(0, '10:00'),
    async run(j) {
      const pack = samplePack(r.gameId, r.packId);
      const lvl = pack.levels[pack.levels.length - 1];
      const page = await j.actor('learner', P.l1);
      const g = await openGame(j, page, { gameId: r.gameId, packId: r.packId, levelId: lvl.id, manual: false });
      await see(tid(page, 'game-canvas'), 'game-canvas');
      await g.act('start');
      await step(page, 'playing');
      await keepBusy(j, page, { gameId: r.gameId, packId: r.packId, levelId: lvl.id, lvl, ms: 20_000 });
      const st = await G(page).stats();
      await step(page, `p50 ${st.frameP50} p95 ${st.frameP95}`);
      assert.ok(st.frameP50 !== null && st.frameP95 !== null, `stats() has frame percentiles after 20 s (frames ${st.frames})`);
      assert.ok(st.frameP50 <= 20, `${r.gameId}: frameP50 ${st.frameP50} ms (budget 20 ms)`);
      assert.ok(st.frameP95 <= 34, `${r.gameId}: frameP95 ${st.frameP95} ms (budget 34 ms)`);
    },
  });
}
