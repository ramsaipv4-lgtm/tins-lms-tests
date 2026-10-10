// AC-247 The games hub (SPEC §13.3 "The hub", Home, cards, other hub pages; D-70): for a seeded learner the hub's
// navigation is a left rail on a wide screen (desktop: data-layout="rail") and a bottom tab bar on a phone
// (data-layout="tabs") with Home, Avatar, Inventory, My Team, Story so far and Settings, each reaching its route; the
// top bar shows the player's avatar, coins, XP, the full-screen button and Ada's alerts (each linking somewhere); Home
// shows its rows in the order continue, recommended, new, games (a row with no cards is hidden; live is not shown),
// Continue lists the unfinished packs most recently played first, New this week lists only packs released in the
// last 7 days, cards carry thumbnail and own progress; "Story so far" stays below the rows; My Team lists members by
// avatar name in alphabetical order with the team's XP and no per-member XP; touch targets are at least 44 px; and no
// hub page shows another learner's score or XP (AC-206 on every hub page).
// Seed games-hub (fixtures/games/seeds/games-hub.json, see its _about): 12-day class, clock on day 9 (11 Nov 2026).
// data-testids used: app-ready*, hub-rail, hub-nav-<page>, hub-topbar, player-avatar, player-coins, player-xp,
//   hub-fullscreen, hub-alerts, hub-alert-<n>, hub-row-<rowId>, hub-card-<gameId>-<packId>, hub-card-thumb,
//   game-tile-<gameId>, story-replay
import { assert, step, see, tid, at, P, NAMES } from '../journeys/_harness.mjs';
import { gamesJourney, dayAt, HUB_PAGES } from '../lib/games.mjs';

const FOREIGN = ['98765', '87654', '4320', '4,320'];
const num = (t) => Number(String(t).replace(/[^\d-]/g, ''));
const CARD = '[data-testid^="hub-card-"]:not([data-testid="hub-card-thumb"]):not([data-testid="hub-card-unlock"])';
const clean = (text, where) => { for (const f of [...FOREIGN, NAMES['person:l2'], NAMES['person:l3']]) assert.ok(!text.includes(f), `${where} shows "${f}", another learner's individual data (AC-206)`); };

gamesJourney({
  name: 'hub', acs: ['AC-247'], title: 'navigation, top bar, Home rows and cards, My Team, 44 px targets, privacy on every hub page',
  seeds: ['games-hub'], clock: dayAt(9, '10:00'), timeoutMs: 150_000,
  async run(j) {
    const page = await j.actor('learner', P.l1, { path: '/learn/games?story=off' });
    // navigation
    const rail = await see(tid(page, 'hub-rail'), 'hub-rail', 20_000);
    assert.equal(await rail.getAttribute('data-layout'), j.phone ? 'tabs' : 'rail', j.phone ? 'a bottom tab bar on a phone' : 'a left rail on a wide screen');
    const rb = await rail.boundingBox();
    const vp = page.viewportSize();
    if (j.phone) assert.ok(rb.y + rb.height >= vp.height - 2 && rb.width >= vp.width * 0.9, `the tab bar sits along the bottom (${JSON.stringify(rb)})`);
    else assert.ok(rb.x <= 2 && rb.height >= vp.height * 0.5 && rb.width < vp.width * 0.4, `the rail sits along the left (${JSON.stringify(rb)})`);
    for (const p of Object.keys(HUB_PAGES)) {
      const n = await see(tid(page, `hub-nav-${p}`), `hub-nav-${p}`);
      const role = await n.evaluate((e) => e.tagName.toLowerCase() === 'a' || e.tagName.toLowerCase() === 'button' || ['link', 'button', 'tab'].includes(e.getAttribute('role')));
      assert.ok(role, `hub-nav-${p} is a real link or button`);
      assert.ok((await n.evaluate((e) => (e.getAttribute('aria-label') || e.innerText || '').trim())).length > 0, `hub-nav-${p} has an accessible name`);
      const b = await n.boundingBox();
      assert.ok(b.width >= 44 && b.height >= 44, `hub-nav-${p} is at least 44 x 44 px (${Math.round(b.width)} x ${Math.round(b.height)})`);
    }
    // top bar
    const top = await see(tid(page, 'hub-topbar'), 'hub-topbar');
    for (const id of ['player-avatar', 'player-coins', 'player-xp', 'hub-fullscreen', 'hub-alerts']) await see(top.getByTestId(id), `${id} in the top bar`);
    assert.equal(num(await top.getByTestId('player-xp').innerText()), 1000, "the top bar shows l1's own XP");
    assert.equal(num(await top.getByTestId('player-coins').innerText()), 15, "the top bar shows l1's own coins");
    const alerts = top.getByTestId('hub-alerts').locator('[data-testid^="hub-alert-"]');
    assert.ok(await alerts.count() >= 1, 'Ada has at least one alert (a new pack, a half-done level)');
    for (let i = 0; i < await alerts.count(); i++) {
      const linked = await alerts.nth(i).evaluate((e) => !!(e.closest('a[href]') || e.querySelector('a[href],button') || e.tagName === 'BUTTON' || e.getAttribute('role') === 'link'));
      assert.ok(linked, `hub-alert ${i + 1} links to where it points`);
    }
    await step(page, 'rail and top bar');
    // Home rows
    const rows = await page.locator('[data-testid^="hub-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').slice('hub-row-'.length)));
    const order = ['continue', 'recommended', 'new', 'games'];
    assert.deepEqual(rows.filter((r) => order.includes(r)), order.filter((r) => rows.includes(r)), `Home rows in order ${order.join(', ')} (got ${rows.join(', ')})`);
    assert.ok(!rows.includes('live'), 'the live row is not shown in this build');
    for (const r of ['continue', 'new', 'games']) assert.ok(rows.includes(r), `the ${r} row is shown`);
    for (const r of rows) assert.ok(await tid(page, `hub-row-${r}`).locator(`${CARD},[data-testid^="game-tile-"]`).count() >= 1, `row ${r} has cards (empty rows are hidden)`);
    const cont = await tid(page, 'hub-row-continue').locator(CARD).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    assert.deepEqual(cont.slice(0, 2), ['hub-card-syntax-drop-sd-path', 'hub-card-syntax-drop-sd-strike'], 'Continue: unfinished packs, most recently played first');
    const fresh = await tid(page, 'hub-row-new').locator('[data-testid^="hub-card-syntax-drop-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    assert.ok(fresh.includes('hub-card-syntax-drop-sd-new'), 'New this week has the pack released yesterday');
    for (const old of ['sd-strike', 'sd-fill', 'sd-path']) assert.ok(!fresh.includes(`hub-card-syntax-drop-${old}`), `New this week leaves out ${old} (released 9 days ago)`);
    await see(tid(page, 'hub-row-games').getByTestId('game-tile-syntax-drop'), 'game-tile-syntax-drop in the games row');
    const card = tid(page, 'hub-row-continue').getByTestId('hub-card-syntax-drop-sd-path').first();
    await see(card.getByTestId('hub-card-thumb'), 'the card thumbnail');
    assert.equal(await card.getAttribute('data-stars'), '2', 'own stars on the card (2 on level 1)');
    assert.equal(await card.getAttribute('data-stars-max'), '9', 'stars max = 3 levels x 3');
    assert.equal(await card.getAttribute('data-levels-left'), '2', 'two levels left to win');
    const cb = await card.boundingBox();
    assert.ok(cb.width >= 44 && cb.height >= 44, 'cards are large touch targets');
    await see(tid(page, 'story-replay'), '"Story so far" below the rows on Home');
    clean(await page.locator('body').innerText(), 'Home');
    await step(page, 'home rows');
    // every hub page: reachable from the navigation, still the hub, nothing private
    for (const [p, route] of Object.entries(HUB_PAGES)) {
      await (await see(tid(page, `hub-nav-${p}`), `hub-nav-${p}`)).click();
      await page.waitForURL(new RegExp(`${route.replace(/\//g, '\\/')}(\\?.*)?$`), { timeout: 15_000 });
      await see(tid(page, 'hub-rail'), `hub-rail on ${route}`);
      clean(await page.locator('body').innerText(), route);
      if (p === 'team') {
        const topText = await tid(page, 'hub-topbar').innerText();
        const text = (await page.locator('body').innerText()).replace(topText, '');
        const a = text.indexOf('Arjun'); const z = text.indexOf('Zara');
        assert.ok(a >= 0 && z >= 0 && a < z, 'My Team lists the members by avatar name in alphabetical order (Arjun, Zara)');
        assert.ok(!text.includes('Kabir'), 'My Team shows only the own team');
        assert.match(text, /2[,.\s ]?660/, "My Team shows the team's XP (average 2660)");
        assert.ok(!/\b1[,.]?000\b/.test(text.replace(/2[,.\s ]?660/g, '')), "no member's own XP on My Team");
      }
      if (p === 'story') await see(tid(page, 'story-replay'), 'story-replay on the Story so far page');
      if (p === 'settings') {
        const text = (await page.locator('body').innerText()).toLowerCase();
        for (const w of ['sound', 'quality', 'autoplay', 'assist']) assert.ok(text.includes(w), `Settings has ${w}`);
      }
      await step(page, `page ${p}`);
    }
    await j.open(page, '/learn/games/syntax-drop?story=off');
    await see(tid(page, 'game-page-syntax-drop'), 'the syntax-drop game page');
    clean(await page.locator('body').innerText(), 'the syntax-drop game page');
  },
});
