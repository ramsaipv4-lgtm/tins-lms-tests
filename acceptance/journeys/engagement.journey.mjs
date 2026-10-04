// AC-168 Engagement (G-1 to G-4) (SPEC §6.3, §4.27 headingStrike, teamBadges, celebrationWall, storyMode).
// data-testids used: app-ready*, heading-strike*, celebration-wall*, section-<id>
// Accessible names used: nav /heading strike/, button /start|play/, answer buttons inside heading-strike, result
//   /round (over|complete)|score/; nav /wall|badges|celebration/; admin switches checkbox /story mode/.
// Seed "portfolio" adds the team-a badge "First merged PR".
import { journey, see, tid, nav, click, clickIfPresent, until, step, at, P, assert } from './_harness.mjs';

journey({
  name: 'heading-strike', acs: ['AC-168'], title: 'Heading Strike plays one round', clock: at(0, '11:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(heading strike)$/i, 'Heading Strike');
    await click(l1, /^(start|play|start round)$/i, 'start round');
    const hs = await see(tid(l1, 'heading-strike'), 'heading-strike');
    await until(async () => {
      if (/round (over|complete)|score/i.test(await hs.innerText())) return true;
      const opts = hs.getByRole('button'); if (await opts.count()) await opts.first().click();
      return false;
    }, 'one round to finish', 45_000, 500);
    await step(l1, 'round done');
  },
});

journey({
  name: 'team-wall', acs: ['AC-168'], title: 'team badges and merged-PR wall are team-level only', seeds: ['base', 'portfolio'], clock: at(2, '12:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(wall|badges|celebration wall|team badges)$/i, 'wall');
    const wall = await see(tid(l1, 'celebration-wall'), 'celebration-wall');
    const text = await wall.innerText();
    assert.match(text, /team.?a/i, 'team names shown');
    assert.match(text, /First merged PR/i, 'team badge shown');
    for (const n of ['Lena Learner', 'Liam Learner', 'Mira Learner']) assert.ok(!text.includes(n), `no individual names on the wall (${n})`);
    assert.equal(await l1.getByText(/leaderboard/i).count(), 0, 'no individual leaderboard');
    await step(l1, 'team wall');
  },
});

journey({
  name: 'story-mode', acs: ['AC-168'], title: 'story mode is off by default and changes only presentation', clock: at(0, '12:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    const sections = async () => { await nav(l1, /^(today|day 0|class|my class)$/i, 'day page'); await see(l1.locator('[data-testid^="section-"]'), 'released sections'); return l1.locator('[data-testid^="section-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid'))); };
    const before = await sections();
    // storyMode is a phase-2 switch: off and hidden by default (SPEC §0, §4.27); the admin turns it on.
    const a = await j.actor('admin', P.admin);
    await nav(a, /^(settings|switches|features|feature switches)$/i, 'switches');
    const sw = a.getByRole('checkbox', { name: /story mode/i }).or(a.getByRole('switch', { name: /story mode/i })).first();
    await see(sw, 'the storyMode switch in the admin switches');
    assert.equal(await sw.isChecked(), false, 'story mode is off by default');
    await sw.check(); await clickIfPresent(a, /^(save|apply)$/i, 2000);
    await step(a, 'story mode on');
    await l1.reload(); await see(l1.getByTestId('app-ready'), 'app shell');
    const after = await sections();
    assert.deepEqual(after, before, 'story mode must not change which sections exist or their order');
    await step(l1, 'same sections with story mode');
  },
});
