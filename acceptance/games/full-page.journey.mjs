// AC-254 Full page (SPEC D-79): on every /learn/games… route (Home and the other hub pages, the game page, a running
// game) the LMS header and space nav are absent, on desktop and on a phone; hub-nav-lms ("Back to LMS") in the rail
// and in the tab bar opens /learn, where the LMS header is back.
// How "the LMS header and space nav" is found (the SPEC gives them no test id): on /learn the suite collects the
// controls (links, buttons, tabs, menu items) inside the page's header/banner and navigation landmarks, by accessible
// name. On a games route none of those controls may be visible, except names the hub itself uses (Home, Avatar,
// Inventory, My Team, Story so far, Settings, Back to LMS) and anything inside hub-rail or hub-topbar.
// Seed games-hub, clock day 9. data-testids used: app-ready*, hub-rail, hub-topbar, hub-nav-lms, game-page-<gameId>
import { assert, step, see, tid, P } from '../journeys/_harness.mjs';
import { gamesJourney, dayAt, gameUrl, G, HUB_PAGES } from '../lib/games.mjs';

const HUB_NAMES = new Set(['home', 'avatar', 'inventory', 'my team', 'story so far', 'settings', 'back to lms']);
const CONTROLS = 'a,button,[role="link"],[role="button"],[role="tab"],[role="menuitem"]';
const nameOf = (e) => (e.getAttribute('aria-label') || e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ');

async function lmsNames(page) {
  return page.evaluate(({ CONTROLS }) => {
    const nameOf = (e) => (e.getAttribute('aria-label') || e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ');
    const marks = [...document.querySelectorAll('header,[role="banner"],nav,[role="navigation"]')].filter((m) => !m.closest('[data-testid="hub-rail"],[data-testid="hub-topbar"]'));
    const names = new Set();
    for (const m of marks) for (const c of m.querySelectorAll(CONTROLS)) { const n = nameOf(c); if (n) names.add(n.toLowerCase()); }
    return [...names];
  }, { CONTROLS });
}
async function visibleLmsControls(page, names) {
  return page.evaluate(({ CONTROLS, names, hub }) => {
    const nameOf = (e) => (e.getAttribute('aria-label') || e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ');
    const want = new Set(names.filter((n) => !hub.includes(n)));
    return [...document.querySelectorAll(CONTROLS)]
      .filter((c) => !c.closest('[data-testid="hub-rail"],[data-testid="hub-topbar"]'))
      .filter((c) => c.checkVisibility ? c.checkVisibility() : c.offsetParent !== null)
      .map((c) => nameOf(c)).filter((n) => want.has(n.toLowerCase()));
  }, { CONTROLS, names, hub: [...HUB_NAMES] });
}

gamesJourney({
  name: 'full-page', acs: ['AC-254'], title: 'no LMS header or space nav on any games route; Back to LMS opens /learn with the header',
  seeds: ['games-hub'], clock: dayAt(9, '10:00'), timeoutMs: 150_000,
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: '/learn' });
    const names = await lmsNames(page);
    assert.ok(names.filter((n) => !HUB_NAMES.has(n)).length >= 1, `the LMS header or space nav on /learn has controls (${names.join(', ')})`);
    await step(page, 'LMS');
    const routes = [...Object.values(HUB_PAGES).map((r) => `${r}?story=off`), '/learn/games/syntax-drop?story=off'];
    for (const r of routes) {
      await j.open(page, r);
      await see(r.startsWith('/learn/games/syntax-drop') ? tid(page, 'game-page-syntax-drop') : tid(page, 'hub-rail'), `the games screen at ${r}`, 20_000);
      const seen = await visibleLmsControls(page, names);
      assert.deepEqual(seen, [], `no LMS header or space nav at ${r} (visible: ${seen.join(', ')})`);
    }
    await j.open(page, gameUrl('syntax-drop', 'sd-strike', '1'));
    const g = G(page);
    await g.waitFor((s) => s && s.status === 'title', 'sd-strike title');
    await g.act('start');
    const seen = await visibleLmsControls(page, names);
    assert.deepEqual(seen, [], `no LMS header or space nav in a running game (visible: ${seen.join(', ')})`);
    await step(page, 'games routes full-page');
    await j.open(page, '/learn/games?story=off');
    const rail = await see(tid(page, 'hub-rail'), 'hub-rail');
    assert.equal(await rail.getAttribute('data-layout'), j.phone ? 'tabs' : 'rail');
    const back = await see(rail.getByTestId('hub-nav-lms'), `hub-nav-lms in the ${j.phone ? 'tab bar' : 'rail'}`);
    assert.match(await back.evaluate(nameOf), /back to lms/i, 'hub-nav-lms is named "Back to LMS"');
    await back.click();
    await page.waitForURL((u) => new URL(u).pathname.replace(/\/$/, '') === '/learn', { timeout: 15_000 });
    await see(page.getByTestId('app-ready'), 'the LMS shell');
    const again = await lmsNames(page);
    assert.ok(again.filter((n) => !HUB_NAMES.has(n)).length >= 1, 'the LMS header is back on /learn');
    await step(page, 'back to LMS');
  },
});
