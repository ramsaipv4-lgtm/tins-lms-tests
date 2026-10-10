// AC-253 How to play (SPEC §13.3 "Title and how to play"): the title screen's howto lists one entry per action the
// learner uses while playing (howto-<n>), each with its keys as key caps (data-keys) and one plain sentence, and a demo
// canvas (howto-demo-<n>) that changes frames on its own with no input; the title has act-start, act-back and
// act-fullscreen. Checked for Syntax Drop in strike mode (sd-strike: strike with a digit key, power-up E) and in fill
// mode (sd-fill: left ←/A, right →/D, drop ↓/S/Space, power-up E), keys from §13.7.1. Real-time clock (no
// clock=manual), so the demos run as a learner sees them. Seeds: games-base, games-seen.
// data-testids used: app-ready*, howto, howto-<n>, howto-demo-<n>, act-start, act-back, act-fullscreen
import { assert, step, see, tid, wait, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame } from '../lib/games.mjs';

// One requirement per playing action: some entry's data-keys must contain one of these key names.
const NEEDS = {
  strike: { strike: /^[1-9]$|^1\s*[-–]\s*9$/, power: /^e$/i },
  fill: { left: /^(←|arrowleft|left|a)$/i, right: /^(→|arrowright|right|d)$/i, drop: /^(↓|arrowdown|down|s|space)$/i, power: /^e$/i },
};
const keysOf = (s) => String(s || '').split(',').map((k) => k.trim()).filter(Boolean);

for (const [mode, packId] of [['strike', 'sd-strike'], ['fill', 'sd-fill']]) {
  gamesJourney({
    name: `howto-${mode}`, acs: ['AC-253'], title: `syntax-drop ${mode}: how to play lists each playing action with keys and a demo that moves on its own`,
    seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
    async run(j) {
      const page = await j.actor('learner', P.l1);
      await openGame(j, page, { gameId: 'syntax-drop', packId, levelId: '1', manual: false });
      const howto = await see(tid(page, 'howto'), 'howto on the title screen');
      for (const id of ['act-start', 'act-back', 'act-fullscreen']) await see(tid(page, id), `${id} on the title screen`);
      const entries = howto.locator('[data-testid^="howto-"]:not([data-testid^="howto-demo-"])');
      const n = await entries.count();
      assert.ok(n >= Object.keys(NEEDS[mode]).length, `at least one entry per playing action (${n})`);
      const all = [];
      for (let i = 0; i < n; i++) {
        const e = entries.nth(i);
        const id = await e.getAttribute('data-testid');
        const k = keysOf(await e.getAttribute('data-keys'));
        assert.ok(k.length >= 1, `${id} shows its keys (data-keys)`);
        all.push(...k);
        assert.equal(await howto.getByTestId(id.replace(/^howto-/, 'howto-demo-')).count(), 1, `${id} has its demo next to it`);
        const text = (await e.innerText()).trim();
        assert.match(text, /[.!?]/, `${id} has a plain sentence saying what it does`);
      }
      for (const [action, re] of Object.entries(NEEDS[mode])) assert.ok(all.some((k) => re.test(k)), `how to play covers ${action} (keys ${all.join(' ')})`);
      const demos = howto.locator('[data-testid^="howto-demo-"]');
      assert.ok(await demos.count() >= 1, 'demo canvases');
      for (let i = 0; i < await demos.count(); i++) {
        const d = demos.nth(i);
        assert.equal(await d.evaluate((el) => el.tagName), 'CANVAS', 'a demo is a canvas the game draws');
        const a = await d.evaluate((el) => el.toDataURL());
        let changed = false;
        for (let t = 0; t < 8 && !changed; t++) { await wait(250); changed = (await d.evaluate((el) => el.toDataURL())) !== a; }
        assert.ok(changed, `demo ${i + 1} changes frames with no input`);
      }
      await step(page, `howto ${mode}`);
    },
  });
}
