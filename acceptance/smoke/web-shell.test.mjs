// Smoke (visible to builders): the built web app is served at "/" and shows its shell (SPEC §2, §6).
// Journeys and performance budgets wait for an element with data-testid="app-ready" that becomes visible once
// the app shell is interactive. Uses Playwright from the app's node_modules (SPEC D-8) and the installed Chromium.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../lib/server.mjs';
import { launch, ensureWebBuild } from '../lib/browser.mjs';

before(() => ensureWebBuild(), { timeout: 180_000 });

for (const profile of ['desktop', 'phone']) {
  test(`smoke: "/" serves the app shell with data-testid="app-ready" [${profile}]`, { timeout: 90_000 }, async () => {
    const s = await start({ testMode: true });
    let b;
    try {
      b = await launch({ profile, journey: 'smoke-web-shell' });
      const page = await b.newPage('visitor');
      const res = await page.goto(s.url + '/');
      assert.equal(res.status(), 200, `GET / -> ${res.status()}`);
      await page.getByTestId('app-ready').waitFor({ state: 'visible', timeout: 30_000 });
      await b.step(page, 'shell');
    } finally { await b?.close(); await s.stop(); }
  });
}
