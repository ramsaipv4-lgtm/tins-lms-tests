// Browser helper for journeys and performance budgets (SPEC §6, §6.1, D-8).
//
// - Playwright is resolved from the APP's node_modules (SPEC D-8: `@playwright/test` 1.63.0 is an app
//   dev dependency); this suite installs nothing.
// - Chromium: env PLAYWRIGHT_CHROMIUM, else /opt/pw-browsers/chromium, else Playwright's default.
// - Profiles (SPEC §6): desktop 1280×800; phone 360×740 with CDP 4× CPU slowdown and network
//   1.6 Mbps down / 750 kbps up / 150 ms latency.
// - Every context records a video and a trace into acceptance/.artifacts/<journey>/<profile>/<actor>/,
//   and step(page, name) saves one screenshot per step there.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { APP_ROOT, ACCEPTANCE } from './paths.mjs';

export const ARTIFACTS = join(ACCEPTANCE, '.artifacts');

export const PROFILES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, cpuRate: 1, network: null },
  phone: {
    viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, cpuRate: 4,
    // CDP throughput is in bytes per second.
    network: { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 },
  },
};
export const PROFILE_NAMES = Object.keys(PROFILES);

let pwCache = null;
/** Returns the `@playwright/test` module from the app's node_modules, or throws a clear error. */
export function playwright() {
  if (pwCache) return pwCache;
  const req = createRequire(join(APP_ROOT, 'package.json'));
  try { pwCache = req('@playwright/test'); } catch (e) {
    throw new Error(`@playwright/test not found from ${APP_ROOT} (SPEC D-8 needs @playwright/test 1.63.0 as an app dev dependency): ${e.message.split('\n')[0]}`);
  }
  if (!pwCache.chromium) throw new Error('@playwright/test did not export chromium (SPEC D-8)');
  return pwCache;
}

export function chromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  if (existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  return undefined; // Playwright default
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'x';

const pageInfo = new WeakMap(); // page -> { dir, n, cdp }

/** Applies the profile's CPU and network emulation to one page through CDP. */
async function applyProfile(page, prof) {
  const info = pageInfo.get(page);
  if (!info || info.applied) return info?.cdp;
  info.applied = true;
  const cdp = await page.context().newCDPSession(page);
  info.cdp = cdp;
  await cdp.send('Network.enable');
  if (prof.cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpuRate });
  if (prof.network) await cdp.send('Network.emulateNetworkConditions', prof.network);
  return cdp;
}

/** The CDP session attached to a page opened through launch() (Network domain enabled). */
export function cdpFor(page) { return pageInfo.get(page)?.cdp; }

/** Saves one numbered screenshot for a step. Never throws (a failed screenshot must not hide the real failure). */
export async function step(page, name) {
  const info = pageInfo.get(page);
  if (!info) return;
  info.n += 1;
  info.last = name;
  const file = join(info.dir, `${String(info.n).padStart(2, '0')}-${slug(name)}.png`);
  try { await page.screenshot({ path: file, timeout: 10_000 }); } catch { /* page may be gone */ }
}
export function lastStep(page) { return pageInfo.get(page)?.last; }

/**
 * launch({ profile: 'desktop' | 'phone', journey, headless = true })
 *   -> { browser, profile, prof, dir, newPage(actor, opts), login(page, baseURL, personId, roles), step, close() }
 * newPage opts: { permissions, clockTime, initScripts: [fn|string], storageState }
 */
export async function launch({ profile = 'desktop', journey = 'adhoc', headless = true } = {}) {
  const prof = PROFILES[profile];
  if (!prof) throw new Error(`unknown profile ${profile}`);
  const { chromium } = playwright();
  const dir = join(ARTIFACTS, slug(journey), profile);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless, executablePath: chromiumPath(), timeout: 30_000 });
  const contexts = [];

  async function newPage(actor = 'user', opts = {}) {
    const actorDir = join(dir, slug(actor));
    mkdirSync(actorDir, { recursive: true });
    const context = await browser.newContext({
      viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor, isMobile: prof.isMobile, hasTouch: prof.hasTouch,
      locale: 'en-IN', timezoneId: 'Asia/Kolkata', acceptDownloads: true,
      permissions: opts.permissions || [], storageState: opts.storageState,
      recordVideo: { dir: actorDir, size: prof.viewport },
    });
    contexts.push({ context, actorDir });
    await context.tracing.start({ screenshots: true, snapshots: true, title: `${journey} ${profile} ${actor}` });
    for (const s of opts.initScripts || []) await context.addInitScript(s);
    if (opts.clockTime !== undefined) await context.clock.install({ time: opts.clockTime });
    // Pages opened later (popups, window.open) get the same emulation.
    context.on('page', (p) => { if (!pageInfo.has(p)) { pageInfo.set(p, { dir: actorDir, n: 0 }); applyProfile(p, prof).catch(() => {}); } });
    const page = await context.newPage();
    if (!pageInfo.has(page)) pageInfo.set(page, { dir: actorDir, n: 0 });
    await applyProfile(page, prof);
    page.setDefaultTimeout(profile === 'phone' ? 20_000 : 10_000);
    page.setDefaultNavigationTimeout(30_000);
    return page;
  }

  /** Signs in through POST /__test/login (SPEC §5.9) using the page's context, so the cookie lands in the browser. */
  async function login(page, baseURL, personId, roles) {
    const r = await page.context().request.post(`${baseURL}/__test/login`, { data: { personId, roles }, timeout: 15_000 });
    if (!r.ok()) throw new Error(`POST /__test/login for ${personId} failed: ${r.status()} ${(await r.text()).slice(0, 200)} (SPEC §5.9)`);
    const cookies = await page.context().cookies(baseURL);
    if (!cookies.length) {
      // Fallback: copy a Set-Cookie header the request context did not store.
      const set = r.headers()['set-cookie'];
      if (!set) throw new Error('/__test/login did not set a session cookie (SPEC §5.2: sessions are HTTP-only cookies)');
      const [pair] = set.split(';'); const i = pair.indexOf('=');
      await page.context().addCookies([{ name: pair.slice(0, i), value: pair.slice(i + 1), url: baseURL, httpOnly: true }]);
    }
  }

  let closed = false;
  async function close() {
    if (closed) return; closed = true;
    // Contexts close in parallel: each saves its trace and finishes its video (can take seconds after a long run).
    await Promise.all(contexts.map(async ({ context, actorDir }) => {
      try { await Promise.race([context.tracing.stop({ path: join(actorDir, 'trace.zip') }), new Promise((r) => setTimeout(r, 5_000))]); } catch {}
      try { await Promise.race([context.close(), new Promise((r) => setTimeout(r, 10_000))]); } catch {}
    }));
    try { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10_000))]); } catch {}
  }
  return { browser, profile, prof, dir, newPage, login, step, close };
}

/** Enables a CDP virtual WebAuthn authenticator so passkey sign-up works headless (SPEC §5.2). */
export async function enablePasskeys(page) {
  const cdp = cdpFor(page) || await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true } });
  return authenticatorId;
}

function newestMtime(dir) {
  let max = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else max = Math.max(max, statSync(p).mtimeMs);
    }
  };
  if (existsSync(dir)) walk(dir);
  return max;
}

let built = false;
/**
 * Builds the web app once per process (SPEC §2: `npm run build -w packages/web`), skipping the build when
 * packages/web/dist/index.html is newer than every source file. LMS_SKIP_WEB_BUILD=1 skips it entirely.
 */
export function ensureWebBuild({ timeoutMs = 170_000 } = {}) {
  if (built || process.env.LMS_SKIP_WEB_BUILD === '1') return;
  const web = join(APP_ROOT, 'packages', 'web');
  if (!existsSync(join(web, 'package.json'))) throw new Error(`web app not found: ${join(web, 'package.json')} (SPEC D-2, §2)`);
  const index = join(web, 'dist', 'index.html');
  const fresh = existsSync(index) && statSync(index).mtimeMs >= Math.max(newestMtime(join(web, 'src')), statSync(join(web, 'package.json')).mtimeMs);
  if (!fresh) {
    const r = spawnSync('npm', ['run', 'build', '-w', 'packages/web'], { cwd: APP_ROOT, encoding: 'utf8', timeout: timeoutMs });
    if (r.status !== 0) throw new Error(`npm run build -w packages/web failed (${r.error?.message || r.status}):\n${(r.stdout + r.stderr).slice(-2000)}`);
    if (!existsSync(index)) throw new Error(`web build produced no ${index}`);
  }
  built = true;
}
