// Shared journey harness (SPEC §6). Not a test file (run.mjs only picks *.journey.mjs / *.test.mjs).
//
// journey({ name, acs, title, profiles, seeds, clock, serverEnv, run }) registers one node:test test per
// profile, named "<AC ids> <title> [<profile>]", with a 90 s hard timeout and a 75 s internal deadline that
// fails with the last completed step. Each test starts its own server (lib/server.mjs), seeds
// fixtures through /__test/seed, sets the clock through /__test/clock, and opens one browser context per
// actor, signed in through /__test/login.
//
// Seed fixtures (acceptance/fixtures/journeys/*.json) are posted as { fixture: "journeys/<name>.json" }.
// Their format is described in each file's "_format" field: { databases: { <dbName>: [docs] },
// packages: [{ path, classId, publish }], joinCodes: [{ code, classId }] }. Seeds are additive.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { start } from '../lib/server.mjs';
import { launch, ensureWebBuild, playwright, enablePasskeys, step, lastStep, cdpFor } from '../lib/browser.mjs';
import { APP_ROOT, SERVER_ENTRY, FIXTURES } from '../lib/paths.mjs';

export { assert, step, cdpFor, enablePasskeys };
export const JFIX = join(FIXTURES, 'journeys');
export const PKG_ROOT = join(FIXTURES, 'package'); // root README, COURSE-MAP.md, FIXTURE.md + track1/ (see FIXTURE.md)
export const PKG = join(PKG_ROOT, 'track1');

// Class c1 in fixtures/journeys/base.json: Mon 2 Nov 2026 to Thu 5 Nov 2026, 09:00-13:00 Asia/Kolkata.
const IST = (d, hm) => Date.parse(`${d}T${hm}:00+05:30`);
export const DAYS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
export const at = (dayIndex, hm = '09:00') => IST(DAYS[dayIndex] ?? '2026-11-06', hm);
export const FRIDAY = (hm = '17:00') => IST('2026-11-06', hm);
export const P = { // people in base.json
  admin: ['person:admin1', ['admin']], trainer: ['person:tr1', ['trainer']], sub: ['person:sub1', ['substitute']],
  coord: ['person:coord1', ['coordinator']], l1: ['person:l1', ['learner']], l2: ['person:l2', ['learner']],
  l3: ['person:l3', ['learner']], l4: ['person:l4', ['learner']],
};
export const NAMES = { 'person:l1': 'Lena Learner', 'person:l2': 'Liam Learner', 'person:l3': 'Mira Learner', 'person:l4': 'Nikhil Learner', 'person:sub1': 'Sam Substitute', 'person:tr1': 'Tara Trainer' };

const TEST_MS = 90_000;
const DEADLINE_MS = 75_000; // leaves ~15 s inside the 90 s test timeout to save video and trace

/** Fails fast (before any browser work) when the app is not there. */
let prereqError = null; let prereqDone = false;
export function prerequisites() {
  if (prereqDone) { if (prereqError) throw prereqError; return; }
  prereqDone = true;
  try {
    if (!existsSync(SERVER_ENTRY)) throw new Error(`server entry not found: ${SERVER_ENTRY} (SPEC §2)`);
    playwright();
    ensureWebBuild();
  } catch (e) { prereqError = e; throw e; }
}

let hooked = false;
/** Registers the one-time prerequisite check (web build may take up to 170 s, outside the per-test 90 s). */
export function hookPrerequisites() { if (hooked) return; hooked = true; before(() => prerequisites(), { timeout: 180_000 }); }

export function journey({ name, acs, title, profiles = ['desktop', 'phone'], seeds = ['base'], clock, serverEnv = {}, run }) {
  hookPrerequisites();
  for (const profile of profiles) {
    test(`${acs.join(' ')} ${title} [${profile}]`, { timeout: TEST_MS }, async (t) => {
      const t0 = Date.now();
      prerequisites();
      const j = await setup({ name: `${name}-${acs[0]}`, profile, serverEnv });
      const kill = () => { j.close().catch(() => {}); };
      t.signal?.addEventListener('abort', kill, { once: true });
      let timer;
      try {
        if (seeds.length) await j.seed(...seeds);
        if (clock !== undefined) await j.clock(clock);
        const runP = run(j); runP.catch(() => {}); // a late rejection after the deadline must not leak
        await Promise.race([
          runP,
          new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${acs.join(' ')}: journey exceeded ${DEADLINE_MS / 1000} s; last step: ${j.lastStep() || '(none)'}`)), Math.max(1000, DEADLINE_MS - (Date.now() - t0))); }),
        ]);
      } catch (e) {
        e.message = `${acs.join(' ')} [${profile}] after step "${j.lastStep() || '(none)'}": ${e.message}\nartifacts: ${j.dir}`;
        throw e;
      } finally { clearTimeout(timer); await j.close(); }
    });
  }
}

/** Creates the per-test context: server + browser + helpers. */
export async function setup({ name, profile, serverEnv = {} }) {
  let server = await start({ testMode: true, env: serverEnv });
  let browser;
  try { browser = await launch({ profile, journey: name }); } catch (e) { await server.stop(); throw e; }
  const pages = [];
  const j = {
    profile, dir: browser.dir, browser, step,
    get server() { return server; }, get url() { return server.url; },
    phone: profile === 'phone',
    lastStep: () => { for (let i = pages.length - 1; i >= 0; i--) { const s = lastStep(pages[i]); if (s) return s; } return null; },
    async seed(...names) {
      for (const n of names) {
        const r = await server.request('/__test/seed', { method: 'POST', body: { fixture: `journeys/${n}.json` } });
        if (r.status >= 300) throw new Error(`POST /__test/seed journeys/${n}.json -> ${r.status} ${r.text.slice(0, 300)} (SPEC §5.9)`);
      }
    },
    async clock(now) {
      const ms = typeof now === 'number' ? now : Date.parse(now);
      const r = await server.request('/__test/clock', { method: 'POST', body: { now: ms } });
      if (r.status >= 300) throw new Error(`POST /__test/clock -> ${r.status} ${r.text.slice(0, 200)} (SPEC §5.9)`);
      // Pages with a Playwright clock move too: forward jumps use fastForward (moves Date, performance.now and timers).
      for (const p of pages) {
        if (!p.__fakeClock) continue;
        const delta = ms - await p.evaluate(() => Date.now()).catch(() => ms);
        if (delta > 0) await p.clock.fastForward(delta).catch(() => {}); else await p.clock.setSystemTime(ms).catch(() => {});
      }
    },
    /** Opens a signed-in page for a person. opts: { path, roles, permissions, fakeClock (ms), initScripts, passkeys } */
    async actor(label, [personId, roles], opts = {}) {
      const page = await browser.newPage(label, { permissions: opts.permissions, clockTime: opts.fakeClock, initScripts: opts.initScripts });
      page.__fakeClock = opts.fakeClock !== undefined;
      pages.push(page);
      await browser.login(page, server.url, personId, roles);
      await j.open(page, opts.path || '/');
      await step(page, `${label} signed in`);
      return page;
    },
    /** Opens a page with no session. */
    async anon(label, path = '/', opts = {}) {
      const page = await browser.newPage(label, { permissions: opts.permissions, clockTime: opts.fakeClock, initScripts: opts.initScripts });
      page.__fakeClock = opts.fakeClock !== undefined;
      pages.push(page);
      if (opts.passkeys) await enablePasskeys(page);
      await j.open(page, path);
      return page;
    },
    /** Navigates and waits for the app shell (data-testid="app-ready", SPEC gap G-1). */
    async open(page, path = '/') {
      await page.goto(server.url + path, { waitUntil: 'domcontentloaded' });
      await see(page.getByTestId('app-ready'), 'the app shell (data-testid="app-ready")', 30_000);
    },
    async relogin(page, [personId, roles]) { await browser.login(page, server.url, personId, roles); },
    /** Stops the server (data dir kept) and restarts it on the same port. */
    async stopServer() { await server.stop(); },
    async restartServer() { server = await restartSame(server); return server; },
    async close() {
      if (j.closed) return; j.closed = true;
      await browser.close().catch(() => {});
      await server.stop().catch(() => {});
    },
  };
  return j;
}

/** Restarts the server with the same port and data dir (lib/server.mjs always picks new ones). */
async function restartSame(old) {
  const env = { ...process.env, PORT: String(old.port), LMS_PROFILE: 'hub', LMS_DATA_DIR: old.dataDir, LMS_TLS: 'off', LMS_TEST_MODE: '1' };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [SERVER_ENTRY], { cwd: APP_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`restarted server did not print LISTENING ${old.port} within 30 s\n${out}`)), 30_000);
    child.stdout.on('data', () => { if (out.includes(`LISTENING ${old.port}`)) { clearTimeout(t); res(); } });
    child.on('exit', (c) => { clearTimeout(t); rej(new Error(`restarted server exited (${c})\n${out}`)); });
  });
  return { ...old, stdout: () => out, async stop() { child.kill('SIGTERM'); await new Promise((r) => { child.once('exit', r); setTimeout(r, 3000); }); } };
}

// ---------- locator helpers ----------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits until the locator is visible, else fails naming what was expected. */
export async function see(locator, what, timeout) {
  try { await locator.first().waitFor({ state: 'visible', timeout }); } catch {
    throw new Error(`expected ${what} to be visible (${locator})`);
  }
  return locator.first();
}
/** Asserts the locator is absent or hidden (after a short settle). */
export async function notSee(locator, what, settleMs = 1500) {
  await wait(settleMs);
  const n = await locator.count();
  for (let i = 0; i < n; i++) if (await locator.nth(i).isVisible()) throw new Error(`expected ${what} NOT to be visible`);
}
export const tid = (page, id) => page.getByTestId(id);

/** Polls a locator's text until it matches re. Returns the text. */
export async function waitText(locator, re, what, timeout = 20_000) {
  const end = Date.now() + timeout; let last = '';
  while (Date.now() < end) {
    try { if (await locator.first().isVisible()) { last = (await locator.first().innerText()).trim(); if (re.test(last)) return last; } } catch {}
    await wait(250);
  }
  throw new Error(`expected ${what} to match ${re}; last text: ${JSON.stringify(last.slice(0, 300))}`);
}
/** Polls an async predicate. */
export async function until(fn, what, timeout = 20_000, every = 400) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await wait(every); }
  throw new Error(`timed out waiting for ${what}${last ? ` (last: ${String(last).slice(0, 200)})` : ''}`);
}

/** First visible element among link/button/tab/menuitem with the given accessible name. */
export async function control(page, name, { timeout = 10_000, roles = ['link', 'button', 'tab', 'menuitem', 'radio', 'checkbox'] } = {}) {
  const end = Date.now() + timeout;
  let triedMenu = false;
  while (Date.now() < end) {
    for (const role of roles) {
      const l = page.getByRole(role, { name });
      const n = await l.count();
      for (let i = 0; i < n; i++) if (await l.nth(i).isVisible()) return l.nth(i);
    }
    if (!triedMenu) { // phone layouts may hide navigation behind a menu button
      const m = page.getByRole('button', { name: /^(menu|open menu|navigation|more)$/i });
      if (await m.count() && await m.first().isVisible()) { await m.first().click(); triedMenu = true; continue; }
    }
    await wait(250);
  }
  return null;
}
/** Clicks a navigation control (link, button, tab or menu item) by accessible name. */
export async function nav(page, name, what) {
  const c = await control(page, name);
  if (!c) throw new Error(`no visible link/button/tab named ${name} (${what || 'navigation'})`);
  await c.click();
  return c;
}
export async function click(page, name, what) { return nav(page, name, what || `button ${name}`); }
export async function clickIfPresent(page, name, timeout = 1500) {
  const c = await control(page, name, { timeout }); if (c) { await c.click(); return true; } return false;
}

/** Fills a field found by label: input, textarea, select or combobox. */
export async function fill(scope, label, value, { required = true, timeout = 8000 } = {}) {
  const l = scope.getByLabel(label);
  try { await l.first().waitFor({ state: 'visible', timeout }); } catch {
    if (required) throw new Error(`no visible form field labelled ${label}`);
    return false;
  }
  const el = l.first();
  const tag = await el.evaluate((e) => e.tagName.toLowerCase());
  if (tag === 'select') {
    const ok = await el.selectOption({ label: value }).catch(() => null) || await el.selectOption(value).catch(() => null);
    if (!ok) { const opts = await el.locator('option').allInnerTexts(); const m = opts.find((o) => o.toLowerCase().includes(String(value).toLowerCase())); if (!m) throw new Error(`select ${label} has no option ${value} (${opts.join(', ')})`); await el.selectOption({ label: m }); }
  } else if ((await el.getAttribute('role')) === 'combobox' && tag !== 'input') {
    await el.click(); await scope.getByRole('option', { name: new RegExp(escapeRe(value), 'i') }).first().click();
  } else if ((await el.getAttribute('type')) === 'checkbox' || (await el.getAttribute('role')) === 'checkbox') {
    if (value) await el.check(); else await el.uncheck();
  } else {
    await el.fill(String(value));
  }
  return true;
}
export const fillIfPresent = (scope, label, value) => fill(scope, label, value, { required: false, timeout: 1500 });

/** Sets a file on an <input type=file> or on whatever file chooser the element opens. */
export async function upload(page, locator, filePath, what) {
  const el = await see(locator, what || 'the upload control');
  const isInput = await el.evaluate((e) => e.tagName === 'INPUT' && e.type === 'file');
  if (isInput) { await el.setInputFiles(filePath); return; }
  const inner = el.locator('input[type=file]');
  if (await inner.count()) { await inner.first().setInputFiles(filePath); return; }
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), el.click()]);
  await chooser.setFiles(filePath);
}
/** Clicks a control and returns the downloaded file { name, path, bytes }. */
export async function download(page, locator, what) {
  const el = await see(locator, what || 'the download control');
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 45_000 }), el.click()]);
  const path = join(mkdtempSync(join(tmpdir(), 'lms-dl-')), d.suggestedFilename() || 'download.bin');
  await d.saveAs(path);
  return { name: d.suggestedFilename(), path, bytes: readFileSync(path) };
}
/** Visible text of the whole page. */
export const pageText = (page) => page.locator('body').innerText();
export const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const ci = (s) => new RegExp(escapeRe(s), 'i');

// ---------- fixture helpers ----------

export function readFixtureJson(rel) { return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')); }

function needPkg() { if (!existsSync(PKG)) throw new Error(`fixture package missing: ${PKG} (see acceptance/fixtures/package/FIXTURE.md)`); }

/** Sections of a day from the fixture instructor script, using the SPEC §4.8 heading rule. */
export function scriptSections(dayIndex) {
  needPkg();
  const md = readFileSync(join(PKG, `day${dayIndex}`, 'instructor_script.md'), 'utf8');
  const out = [];
  for (const line of md.split('\n')) {
    const m = /^##\s+(.*)\(\s*(\d+):(\d\d)\s*[—–-]\s*(\d+):(\d\d)\s*\)\s*\**\s*$/.exec(line.trim());
    if (!m) continue;
    let title = m[1].replace(/\*\*/g, '').trim();
    const graded = /\[graded\]/i.test(title);
    title = title.replace(/\[graded\]/i, '').replace(/\s+/g, ' ').trim();
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    out.push({ id, title, graded, plannedSec: ((+m[4] * 60 + +m[5]) - (+m[2] * 60 + +m[3])) * 60 });
  }
  if (!out.length) throw new Error(`no timed sections in fixture day${dayIndex}/instructor_script.md`);
  return out;
}

/** The fixture Shift pack (SPEC §4.10). */
export function shiftPack() { needPkg(); return JSON.parse(readFileSync(join(PKG, 'shift', 'shift-pack-1.json'), 'utf8')); }

/**
 * The 8-question diagnostic of a day from the fixture quick-learn: [{ n, text, options: [{letter, text}], answer: {letter?, text} }].
 * Tolerant parser: questions are numbered lines after a heading containing "diagnostic"; options are lines like
 * "A) ...", "- (b) ...", "a. ..."; answers are numbered lines after a heading containing "answer".
 */
export function diagnostic(dayIndex) {
  needPkg();
  const md = readFileSync(join(PKG, `day${dayIndex}`, 'quicklearn.md'), 'utf8').split('\n');
  const strip = (s) => s.replace(/[*_`]/g, '').trim();
  let mode = null; const qs = []; const ans = [];
  for (const raw of md) {
    const line = raw.trim();
    if (/^#+\s/.test(line)) { mode = /answer/i.test(line) ? 'a' : /diagnostic/i.test(line) ? 'q' : mode === 'q' && !/question/i.test(line) ? null : mode; continue; }
    const num = /^(?:\*\*)?(?:Q)?(\d+)[.)](?:\*\*)?\s+(.*)$/.exec(line);
    const opt = /^(?:[-*]\s*)?\(?([A-Da-d])[).]\s+(.*)$/.exec(line);
    if (mode === 'q') {
      if (num && qs.length < 8) qs.push({ n: +num[1], text: strip(num[2]), options: [] });
      else if (opt && qs.length) qs[qs.length - 1].options.push({ letter: opt[1].toUpperCase(), text: strip(opt[2]) });
    } else if (mode === 'a' && num && ans.length < 8) {
      const t = strip(num[2]);
      const lm = /^\(?([A-Da-d])(?:\)|[.:]|\s+[—–-]\s|$)/.exec(t); // "B)", "(b)", "C.", "D — because…"
      const rest = (lm ? t.slice(lm[0].length) : t).split(/\s[—–]\s/)[0].trim();
      ans.push({ n: +num[1], letter: lm ? lm[1].toUpperCase() : null, text: rest || t });
    }
  }
  if (qs.length !== 8 || ans.length !== 8) throw new Error(`could not parse the 8-question diagnostic of fixture day${dayIndex} (found ${qs.length} questions, ${ans.length} answers)`);
  return qs.map((q, i) => {
    const a = ans[i];
    const optText = a.letter && q.options.find((o) => o.letter === a.letter)?.text;
    return { ...q, answer: { letter: a.letter, text: optText || a.text } };
  });
}

const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
const overlap = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };

/**
 * Answers the diagnostic shown on the page: nCorrect questions right, the rest wrong. Each question is in
 * data-testid="diag-q-<n>" (n = 1..8 in display order); options are radios, or a text box for free answers.
 * Questions and options are matched to the key by text, so seeded shuffling (P-6) does not matter.
 */
export async function answerDiagnostic(page, dayIndex, nCorrect) {
  const key = diagnostic(dayIndex);
  for (let n = 1; n <= 8; n++) {
    const box = await see(page.getByTestId(`diag-q-${n}`), `diagnostic question diag-q-${n}`);
    const shown = await box.innerText();
    const q = key.reduce((best, k) => (overlap(shown, k.text) > overlap(shown, best.text) ? k : best), key[n - 1]);
    const right = n <= nCorrect;
    const radios = box.getByRole('radio');
    const count = await radios.count();
    if (count) {
      let pick = -1; const names = [];
      for (let i = 0; i < count; i++) names.push((await radios.nth(i).evaluate((e) => (e.labels?.[0]?.innerText || e.getAttribute('aria-label') || e.closest('label')?.innerText || e.value || ''))).trim());
      const isRight = (s) => s && (s.toLowerCase().includes(q.answer.text.toLowerCase()) || q.answer.text.toLowerCase().includes(s.toLowerCase().replace(/^[a-d][).]\s*/i, '')));
      pick = right ? names.findIndex(isRight) : names.findIndex((s) => !isRight(s));
      if (pick < 0 && right && q.answer.letter) pick = q.answer.letter.charCodeAt(0) - 65;
      if (pick < 0 || pick >= count) throw new Error(`diag-q-${n}: no option matching answer "${q.answer.text}" among ${JSON.stringify(names)}`);
      await radios.nth(pick).check();
    } else {
      await box.getByRole('textbox').first().fill(right ? q.answer.text : 'zzz wrong answer');
    }
  }
  await click(page, /^(submit|check|finish)( answers| diagnostic)?$/i, 'diagnostic submit button');
}

/** ustar archive of a package folder's contents (entries at the archive root, as the package root is laid out). */
export function packageTar(root = PKG_ROOT) {
  needPkg();
  const out = join(mkdtempSync(join(tmpdir(), 'lms-tar-')), 'package.tar');
  const r = spawnSync('tar', ['--format=ustar', '-cf', out, '-C', root, ...readdirSync(root).sort()], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  return out;
}
/** Copy of the whole fixture package in a temp folder, for planting changes. Returns the copy's root. */
export function packageCopy() { needPkg(); const d = join(mkdtempSync(join(tmpdir(), 'lms-pkg-')), 'package'); cpSync(PKG_ROOT, d, { recursive: true }); return d; }

/** Minimal ustar / gzip reader: returns [{ path, bytes }]. */
export function untar(buf) {
  let b = Buffer.from(buf);
  if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
  const files = []; let off = 0;
  while (off + 512 <= b.length) {
    const h = b.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const str = (s, l) => h.subarray(s, s + l).toString('utf8').replace(/\0.*$/s, '');
    const name = str(0, 100); const prefix = str(345, 155);
    const size = parseInt(str(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    off += 512;
    if (type === '0' || type === '\0') files.push({ path: prefix ? `${prefix}/${name}` : name, bytes: b.subarray(off, off + size) });
    off += Math.ceil(size / 512) * 512;
  }
  return files;
}

/**
 * Seeded user data and course content (not UI strings), as normalised units: every JSON string value of the
 * journey seeds, and every Markdown line / table cell / heading title (time range and [graded] removed) of the
 * fixture package. has(text) is true when text equals a unit, or is a substring of one and at least 20 characters
 * long (rendered content split across elements). Short UI words ("Next", "Quiz") are therefore not excused just
 * because they occur somewhere in the course prose.
 */
export function fixtureCorpus() {
  const norm = (x) => String(x).toLowerCase().replace(/[*_`#>]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  const units = new Set();
  const addText = (t) => { const n = norm(t); if (n) units.add(n); };
  const walk = (v) => { if (typeof v === 'string') addText(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  const add = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { add(p); continue; }
      const text = /\.(json|md|txt|mmd|csv)$/.test(e.name) ? readFileSync(p, 'utf8') : null;
      if (text == null) continue;
      if (e.name.endsWith('.json')) { try { walk(JSON.parse(text)); } catch {} continue; }
      for (const line of text.split('\n')) {
        addText(line.replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
        if (line.includes('|')) line.split('|').forEach(addText);
        const h = /^#+\s+(.*?)(\s*\(\s*\d+:\d\d\s*[—–-]\s*\d+:\d\d\s*\))?\s*\**\s*$/.exec(line);
        if (h) { addText(h[1].replace(/\[graded\]/i, '')); }
      }
    }
  };
  add(JFIX); add(join(FIXTURES, 'package'));
  const list = [...units];
  return { size: units.size, has(t) { const n = norm(t); return units.has(n) || (n.length >= 20 && list.some((u) => u.includes(n))); } };
}

/** Raw documents of a database through the replication endpoint (SPEC §5.6), using a page's session cookie. */
export async function dbDocs(j, page, db) {
  const cookies = await page.context().cookies(j.url);
  const r = await fetch(`${j.url}/db/${db}/_all_docs?include_docs=true`, { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') } });
  if (!r.ok) throw new Error(`GET /db/${db}/_all_docs -> ${r.status}`);
  return (await r.json()).rows.map((x) => x.doc).filter((d) => d && !String(d._id).startsWith('_design'));
}

/** Coach space unlock (SPEC AC-156: the Coach space needs a PIN). Sets the PIN the first time. */
export async function unlockCoach(page, pin = '2468') {
  const field = page.getByLabel(/^(pin|enter pin|new pin|coach pin|choose a pin)$/i);
  try { await field.first().waitFor({ state: 'visible', timeout: 4000 }); } catch { return false; }
  await field.first().fill(pin);
  await fillIfPresent(page, /confirm pin|repeat pin/i, pin);
  await click(page, /^(set pin|save|unlock|continue|ok)$/i, 'Coach PIN button');
  return true;
}

export { relative, writeFileSync, statSync, wait };
