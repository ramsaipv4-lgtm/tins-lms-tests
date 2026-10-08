// AC-200 Bundle budgets (SPEC-games G2, games contract D-G16, AC-200 r3 text): gzip sizes in packages/web/dist —
// games-engine <= 60 KB, snek <= 40 KB, games-story <= 30 KB, each first-wave 2D game chunk (game-<id>) <= 80 KB,
// three <= 180 KB and each 3D game chunk <= 90 KB once they exist (the 3D games are the second wave); no game chunk
// (and not three) is requested by the page before the learner opens the arcade (a service worker may precache).
// Chunks are found by `name` in Vite's manifest packages/web/dist/.vite/manifest.json. A chunk's size is gzip -9 of its
// file plus the files it statically imports that neither the app entry, games-engine, snek, games-story nor three import.
// Seeds: games-base (+ games-seen so no prologue). Profile: phone (lib/browser.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { hookPrerequisites, prerequisites, setup, see, nav, at, P } from '../journeys/_harness.mjs';
import { APP_ROOT } from '../lib/paths.mjs';
import { seedGames, FIRST_WAVE } from '../lib/games.mjs';

hookPrerequisites();
const DIST = join(APP_ROOT, 'packages', 'web', 'dist');
const KB = 1024;
const BUDGET = { 'games-engine': 60, snek: 40, 'games-story': 30, three: 180 };
const SECOND_WAVE_3D = ['maze-coder', 'breakout', 'garage'];

function manifest() {
  const p = join(DIST, '.vite', 'manifest.json');
  if (!existsSync(p)) throw new Error(`no build manifest at ${p}: the web build must write Vite's manifest (games contract D-G16)`);
  return JSON.parse(readFileSync(p, 'utf8'));
}
const byName = (m, name) => Object.entries(m).find(([, v]) => v.name === name);
function reach(m, key, stop, seen = new Set()) { // static imports, not crossing `stop` keys
  if (seen.has(key)) return seen; seen.add(key);
  for (const k of m[key]?.imports || []) if (!stop.has(k)) reach(m, k, stop, seen);
  return seen;
}
function gzSize(m, key) {
  const shared = new Set();
  for (const [k, v] of Object.entries(m)) if (v.isEntry) for (const x of reach(m, k, new Set())) shared.add(x);
  const named = ['games-engine', 'snek', 'games-story', 'three'].map((n) => byName(m, n)?.[0]).filter(Boolean);
  for (const k of named) if (k !== key) for (const x of reach(m, k, new Set())) shared.add(x);
  let bytes = 0;
  for (const k of reach(m, key, shared)) bytes += gzipSync(readFileSync(join(DIST, m[k].file)), { level: 9 }).length;
  return bytes;
}

test('AC-200 gzip sizes of the named game chunks are within budget', { timeout: 200_000 }, () => {
  prerequisites();
  const m = manifest();
  const sizes = {};
  for (const name of ['games-engine', 'snek', 'games-story']) {
    const e = byName(m, name);
    assert.ok(e, `manifest has a chunk named "${name}" (D-G16)`);
    sizes[name] = gzSize(m, e[0]);
    assert.ok(sizes[name] <= BUDGET[name] * KB, `${name} is ${(sizes[name] / KB).toFixed(1)} KB gzip (budget ${BUDGET[name]} KB)`);
  }
  for (const g of FIRST_WAVE) {
    const e = byName(m, `game-${g}`);
    assert.ok(e, `manifest has a chunk named "game-${g}" (D-G16)`);
    sizes[g] = gzSize(m, e[0]);
    assert.ok(sizes[g] <= 80 * KB, `game-${g} is ${(sizes[g] / KB).toFixed(1)} KB gzip (budget 80 KB for a 2D game)`);
  }
  const three = byName(m, 'three');
  if (three) { sizes.three = gzSize(m, three[0]); assert.ok(sizes.three <= 180 * KB, `three is ${(sizes.three / KB).toFixed(1)} KB gzip (budget 180 KB)`); }
  for (const g of SECOND_WAVE_3D) {
    const e = byName(m, `game-${g}`);
    if (e) { const s = gzSize(m, e[0]); assert.ok(s <= 90 * KB, `game-${g} is ${(s / KB).toFixed(1)} KB gzip (budget 90 KB for a 3D game, excluding three)`); }
  }
});

test('AC-200 no game chunk and not three is requested before the learner opens the arcade [phone]', { timeout: 120_000 }, async (t) => {
  prerequisites();
  const m = manifest();
  const gameFiles = Object.values(m).filter((v) => v.name && (/^game-|^games-|^snek$|^three$/.test(v.name))).map((v) => v.file.split('/').pop());
  assert.ok(gameFiles.length >= 3, 'the manifest names the game chunks (D-G16)');
  const j = await setup({ name: 'games-ac200', profile: 'phone' });
  t.signal?.addEventListener('abort', () => { j.close().catch(() => {}); }, { once: true });
  try {
    await seedGames(j, 'games-base', 'games-seen'); // games-base is a full copy of journeys/base.json with the games package
    await j.clock(at(0, '10:00'));
    const page = await j.browser.newPage('learner');
    await j.browser.login(page, j.url, ...P.l1);
    const early = [];
    let opened = false;
    page.on('request', (r) => { if (!opened && gameFiles.some((f) => r.url().endsWith(f))) early.push(r.url()); });
    await j.open(page, '/');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await nav(page, /^(today|day 0|class|my class)$/i, 'day page');
    await see(page.locator('[data-testid^="section-"]'), 'released sections', 30_000);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await j.step(page, 'before the arcade');
    assert.deepEqual(early, [], 'AC-200: game chunks were requested by the page before the arcade was opened');
    opened = true;
    await nav(page, /^games$/i, 'Games (arcade) navigation');
    await see(page.locator('[data-testid^="game-tile-"]'), 'an arcade tile', 30_000);
    await j.step(page, 'arcade');
  } finally { await j.close(); }
});
