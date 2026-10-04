// AC-100, AC-101, AC-102 Performance budgets on the low-end phone profile (SPEC §6.1).
// Profile: 360×740, CDP CPU slowdown 4×, network 1.6 Mbps down / 750 kbps up / 150 ms latency (lib/browser.mjs).
// data-testids used: app-ready* (shell interactive marker, SPEC gap G-1), section-<id>, board
// Accessible names used: nav /today|day 0|class/ (learner), /board/ (trainer).
//
// Measurements (all in the page, with performance.now(), polled every 50 ms):
// - AC-100 shell interactive = time from navigation start until [data-testid="app-ready"] is visible.
//   First load: fresh context, empty cache, <= 4000 ms. Repeat load: same context after a service worker
//   controls the page, reload, <= 1500 ms. Day page: from clicking the day-page link (after app-ready) until the
//   first [data-testid^="section-"] is visible, <= 2000 ms.
// - AC-101 board usable = from clicking the board link until a <canvas> inside [data-testid="board"] is visible,
//   <= 3000 ms. "Board JS not downloaded until opened": scripts the PAGE fetched before opening the board contain
//   at most 20 occurrences of "excalidraw" each (a lazy-chunk file name is fine; the fork's code is not), and the
//   scripts fetched when opening it contain at least 20 in total. Service-worker precache fetches are not page
//   fetches (SPEC gap G-7 asks the SPEC to say whether precaching the board chunk is allowed).
// - AC-102 app-shell JS = sum of CDP Network.loadingFinished encodedDataLength (bytes on the wire, i.e.
//   compressed) for responses of type Script during the first load until app-ready plus network idle (max 3 s):
//   < 300 KB (307,200 bytes). Third-party: every request of the context (pages and service worker) during first
//   load, repeat load, day page and board must go to the server's own origin (or data:/blob:).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hookPrerequisites, prerequisites, setup, see, nav, at, P, cdpFor } from '../journeys/_harness.mjs';

hookPrerequisites();
const opts = { timeout: 90_000 };

async function withPhone(t, name, fn) {
  prerequisites();
  const j = await setup({ name, profile: 'phone' });
  t.signal?.addEventListener('abort', () => { j.close().catch(() => {}); }, { once: true }); // timeout -> clean shutdown
  try { await j.seed('base'); await j.clock(at(0, '10:00')); await fn(j); } finally { await j.close(); }
}
/** performance.now() at which the selector first became visible (page time since navigation start). */
const visibleAt = (page, selector, timeout = 20_000) => page.waitForFunction((sel) => {
  const el = document.querySelector(sel);
  return el && (!el.checkVisibility || el.checkVisibility()) && el.getBoundingClientRect().width > 0 ? performance.now() : false;
}, selector, { polling: 50, timeout }).then((h) => h.jsonValue());

function watchHosts(j, page) {
  const bad = new Set();
  const origin = new URL(j.url).origin;
  page.context().on('request', (r) => { const u = r.url(); if (!/^(data|blob):/.test(u) && new URL(u).origin !== origin) bad.add(u); });
  return bad;
}
async function signedInBlank(j, label, who) {
  const page = await j.browser.newPage(label);
  await j.browser.login(page, j.url, ...who);
  return page;
}

test('AC-100 app shell interactive <= 4 s first load and <= 1.5 s repeat load; day page <= 2 s after the shell [phone]', opts, async (t) => {
  await withPhone(t, 'perf-ac100', async (j) => {
    const page = await signedInBlank(j, 'learner', P.l1);
    const bad = watchHosts(j, page);
    await page.goto(j.url + '/', { waitUntil: 'commit' });
    const first = await visibleAt(page, '[data-testid="app-ready"]').catch(() => { throw new Error('AC-100: data-testid="app-ready" never became visible on first load'); });
    await j.step(page, `first load ${Math.round(first)} ms`);
    assert.ok(first <= 4000, `AC-100: first load shell interactive in ${Math.round(first)} ms (budget 4000 ms)`);

    const t0 = await page.evaluate(() => performance.now());
    await nav(page, /^(today|day 0|class|my class)$/i, 'day page');
    const tDay = await visibleAt(page, '[data-testid^="section-"]');
    assert.ok(tDay - t0 <= 2000, `AC-100: day page in ${Math.round(tDay - t0)} ms after the shell (budget 2000 ms)`);

    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30_000, polling: 250 })
      .catch(() => { throw new Error('AC-100: no service worker controls the page (repeat load must come from the service worker, D-5)'); });
    await page.reload({ waitUntil: 'commit' });
    const repeat = await visibleAt(page, '[data-testid="app-ready"]');
    await j.step(page, `repeat load ${Math.round(repeat)} ms`);
    assert.ok(repeat <= 1500, `AC-100: repeat load shell interactive in ${Math.round(repeat)} ms (budget 1500 ms)`);
    assert.deepEqual([...bad], [], 'AC-102: no requests to other hosts');
  });
});

test('AC-101 board usable <= 3 s; board JavaScript not downloaded until the board is opened [phone]', opts, async (t) => {
  await withPhone(t, 'perf-ac101', async (j) => {
    const page = await signedInBlank(j, 'trainer', P.trainer);
    const bad = watchHosts(j, page);
    const scripts = []; let phase = 'before';
    page.on('response', async (r) => {
      if (r.request().resourceType() !== 'script') return;
      const entry = { phase, url: r.url(), hits: 0 }; scripts.push(entry);
      try { entry.hits = ((await r.text()).match(/excalidraw/gi) || []).length; } catch {}
    });
    await page.goto(j.url + '/', { waitUntil: 'commit' });
    await visibleAt(page, '[data-testid="app-ready"]');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    phase = 'after';
    const t0 = await page.evaluate(() => performance.now());
    await nav(page, /^(board|whiteboard|open board)$/i, 'board');
    const t1 = await visibleAt(page, '[data-testid="board"] canvas', 30_000);
    await see(page.getByTestId('board'), 'board');
    await j.step(page, `board ${Math.round(t1 - t0)} ms`);
    assert.ok(t1 - t0 <= 3000, `AC-101: board usable in ${Math.round(t1 - t0)} ms (budget 3000 ms)`);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const early = scripts.filter((s) => s.phase === 'before' && s.hits > 20);
    assert.deepEqual(early.map((s) => s.url), [], 'AC-101: board (Excalidraw) code was downloaded before the board was opened');
    const lateHits = scripts.filter((s) => s.phase === 'after').reduce((n, s) => n + s.hits, 0);
    assert.ok(lateHits >= 20, `AC-101: opening the board should download the board's JavaScript (found ${scripts.filter((s) => s.phase === 'after').length} new scripts)`);
    assert.deepEqual([...bad], [], 'AC-102: no requests to other hosts');
  });
});

test('AC-102 app shell JavaScript < 300 KB compressed; no third-party CDN requests [phone]', opts, async (t) => {
  await withPhone(t, 'perf-ac102', async (j) => {
    const page = await signedInBlank(j, 'learner', P.l1);
    const bad = watchHosts(j, page);
    const cdp = cdpFor(page);
    const isScript = new Set(); let bytes = 0; const files = [];
    cdp.on('Network.responseReceived', (e) => { if (e.type === 'Script') isScript.add(e.requestId); });
    cdp.on('Network.loadingFinished', (e) => { if (isScript.has(e.requestId)) { bytes += e.encodedDataLength; files.push(e.encodedDataLength); } });
    await page.goto(j.url + '/', { waitUntil: 'commit' });
    await visibleAt(page, '[data-testid="app-ready"]');
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await j.step(page, `shell js ${bytes} bytes`);
    assert.ok(files.length > 0, 'AC-102: the app shell loads at least one script');
    assert.ok(bytes < 300 * 1024, `AC-102: app shell JavaScript is ${(bytes / 1024).toFixed(1)} KB on the wire in ${files.length} files (budget < 300 KB)`);
    await nav(page, /^(today|day 0|class|my class)$/i, 'day page');
    await visibleAt(page, '[data-testid^="section-"]');
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    assert.deepEqual([...bad], [], 'AC-102: no requests to other hosts (third-party CDNs) at runtime');
  });
});
