// Shared helpers for the games acceptance rows (games contract revision 3: SPEC §13 / SPEC-games.md).
// Not a test file.
//
// - tuning(): the §13.T7 Tuning table, parsed at run time from SPEC.md (falling back to SPEC-games.md until the
//   fold), so a retune that goes through the SPEC changes the tests without editing them (D-G23).
// - gamesJourney(): journey() with the games seeds (acceptance/fixtures/games/seeds/*.json, posted as
//   /__test/seed { fixture: 'games/seeds/<name>.json' }) and the clock applied after seeding.
// - openGame() + G(page): the deep link /learn/games/<gameId>/<packId>/<levelId>?seed&clock=manual&story=off
//   (D-G9, D-G10) and a handle on window.__game { id, state(), act(), advance(), stats() }.
// - controller(page, gameId, mode): one input layer for drivers: 'act' (window.__game.act), 'keys' (keyboard
//   only, §13.T1/§13.T5 keys) or 'buttons' (on-screen act-<action>[-<arg>] buttons, pointer only).
// - drivers for the four first-wave games, which play only through act/state/advance, keys or buttons (D-G17).
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { APP_ROOT, FIXTURES } from './paths.mjs';
import { journey, see, tid, wait, dbDocs, assert } from '../journeys/_harness.mjs';

export const GFIX = join(FIXTURES, 'games');
export const GPKG = join(GFIX, 'package');
export const CLI = join(APP_ROOT, 'packages', 'cli', 'src', 'main.ts');
export const SAMPLE_PACKS = join(APP_ROOT, 'packages', 'games', 'packs');
export const STORY_DIR = join(APP_ROOT, 'packages', 'games', 'story');
export const SHOP_JSON = join(APP_ROOT, 'packages', 'games', 'shop.json');
export const TUNING_TS = join(APP_ROOT, 'packages', 'games', 'src', 'tuning.ts');
export const FIRST_WAVE = ['syntax-drop', 'sniper', 'whack-a-bug', 'aftershock'];
export const SWITCH_OF = { 'syntax-drop': 'game.syntaxDrop', sniper: 'game.sniper', 'whack-a-bug': 'game.whackABug', aftershock: 'game.aftershock' };

// ---------- tuning (§13.T7) ----------

let tuningCache = null;
/** { name: number } from the first "Tuning" table in SPEC.md, else SPEC-games.md (app repo root). */
export function tuning() {
  if (tuningCache) return tuningCache;
  const tried = [];
  for (const f of ['SPEC.md', 'SPEC-games.md']) {
    const p = join(APP_ROOT, f); tried.push(p);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    const h = lines.findIndex((l) => /^#{2,5}\s.*\bTuning\b/.test(l));
    if (h < 0) continue;
    const out = {};
    for (let i = h + 1; i < lines.length && !/^#{1,5}\s/.test(lines[i]); i++) {
      const m = /^\|\s*`([A-Za-z][\w.]*)`\s*\|\s*(-?\d+(?:\.\d+)?)\s*\|/.exec(lines[i]);
      if (m) out[m[1]] = Number(m[2]);
    }
    if (Object.keys(out).length) { tuningCache = out; return out; }
  }
  throw new Error(`no Tuning table (a heading containing "Tuning" followed by | \`name\` | value | rows) in ${tried.join(' or ')} (games contract §13.T7, D-G23)`);
}
/** One tuning value; throws naming the missing row. */
export function T(name) {
  const t = tuning();
  if (!(name in t)) throw new Error(`Tuning table has no row \`${name}\` (games contract §13.T7)`);
  return t[name];
}
/** Checks TUNING exported by packages/games/src/tuning.ts against the SPEC table for names with a prefix. */
export async function assertTuningTs(prefix) {
  if (!existsSync(TUNING_TS)) throw new Error(`tuning file not found: ${TUNING_TS} (D-G23)`);
  const m = await import(pathToFileURL(TUNING_TS).href);
  assert.ok(m.TUNING && typeof m.TUNING === 'object', 'packages/games/src/tuning.ts exports TUNING (D-G23)');
  for (const [k, v] of Object.entries(tuning())) {
    if (!k.startsWith(prefix)) continue;
    assert.equal(m.TUNING[k], v, `TUNING['${k}'] equals the SPEC Tuning table (${v})`);
  }
}

// ---------- fixtures and product data ----------

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
/** The suite's own pack (fixtures/games/package/track1/games/<gameId>/<packId>.json). */
export const ownPack = (gameId, packId) => readJson(join(GPKG, 'track1', 'games', gameId, `${packId}.json`));
/** A builder sample pack, read at run time (D-G18 layout). */
export function samplePack(gameId, packId) {
  const p = join(SAMPLE_PACKS, gameId, `${packId}.json`);
  if (!existsSync(p)) throw new Error(`sample pack not found: ${p} (SPEC-games G6, D-G18)`);
  return readJson(p);
}
/** { snippets: { <snippetId>: stdout } } for the suite's own packs, computed with CPython by fixtures/games/build_fixtures.py. */
export const snippetOutputs = () => readJson(join(GFIX, 'packs', 'outputs.json'));
export const level = (pack, levelId) => { const l = pack.levels.find((x) => String(x.id) === String(levelId)); if (!l) throw new Error(`pack ${pack.id} has no level ${levelId}`); return l; };

/** Runs the CLI (SPEC-games G5): node packages/cli/src/main.ts <args>. */
export function runCli(args, { cwd = APP_ROOT, timeoutMs = 60_000 } = {}) {
  if (!existsSync(CLI)) throw new Error(`cli entry not found: ${CLI} (SPEC-games G5)`);
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; if (out.length > 1 << 20) out = out.slice(-(1 << 19)); });
    child.stderr.on('data', (d) => { err += d; if (err.length > 1 << 20) err = err.slice(-(1 << 19)); });
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`cli ${args.join(' ')} did not finish within ${timeoutMs} ms\n${out.slice(-1000)}\n${err.slice(-1000)}`)); }, timeoutMs);
    child.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err }); });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}
/** Problem lines of `games check` output: `<file>: <where>: <message>` (§13.T4). */
export const problemLines = (out) => out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^ok:/.test(l));
export const tempDir = (p = 'lms-games-') => mkdtempSync(join(tmpdir(), p));

// ---------- journeys ----------

/** POSTs games seeds (acceptance/fixtures/games/seeds/<name>.json). */
export async function seedGames(j, ...names) {
  for (const n of names) {
    const r = await j.server.request('/__test/seed', { method: 'POST', body: { fixture: `games/seeds/${n}.json` } });
    if (r.status >= 300) throw new Error(`POST /__test/seed games/seeds/${n}.json -> ${r.status} ${r.text.slice(0, 300)} (SPEC §5.9, games contract seeds)`);
  }
}
/** journey() with games seeds; `seeds` default ['games-base']; the clock is set after seeding. */
export function gamesJourney({ seeds = ['games-base'], clock, run, ...rest }) {
  journey({
    ...rest, seeds: [],
    async run(j) {
      await seedGames(j, ...seeds);
      if (clock !== undefined) await j.clock(clock);
      return run(j);
    },
  });
}

export function gameUrl(gameId, packId, levelId, { story = false, manual = true, seed = 7 } = {}) {
  const q = new URLSearchParams();
  if (seed != null) q.set('seed', String(seed));
  if (manual) q.set('clock', 'manual');
  if (!story) q.set('story', 'off');
  return `/learn/games/${gameId}/${encodeURIComponent(packId)}/${encodeURIComponent(levelId)}?${q}`;
}
export const arcadeUrl = ({ story = false } = {}) => (story ? '/learn/games' : '/learn/games?story=off');

/** Handle on window.__game in a page (test mode only, §13.T1). */
export function G(page) {
  const call = (fn, ...args) => page.evaluate(([f, a]) => {
    const g = window.__game;
    if (!g) throw new Error('window.__game is not defined (test mode, games contract §13.T1)');
    return g[f](...a);
  }, [fn, args]);
  const h = {
    id: () => page.evaluate(() => window.__game?.id ?? null),
    present: () => page.evaluate(() => !!window.__game),
    state: () => call('state'),
    act: (action, arg) => (arg === undefined ? call('act', action) : call('act', action, arg)),
    /** advance(ms) of driver time; returns the state. */
    advance: (ms) => call('advance', ms),
    stats: () => call('stats'),
    /** Moves game time forward by `gameMs`, whatever the assist factor. */
    async advanceGame(gameMs) {
      const s = await h.state();
      const f = s.assist ? T('common.assistFactor') : 1;
      return gameMs > 0 ? h.advance(gameMs / f) : s;
    },
    /** Advances in steps until pred(state) is true. */
    async advanceUntil(pred, what, { stepMs = 50, maxMs = 120_000 } = {}) {
      let s = await h.state(); let spent = 0;
      while (!pred(s)) {
        if (spent >= maxMs) throw new Error(`game: ${what} did not happen within ${maxMs} ms of game-driver time (last status ${s.status}, clockMs ${s.clockMs})`);
        s = await h.advance(stepMs); spent += stepMs;
      }
      return s;
    },
    /** Polls (real time) until pred(state). */
    async waitFor(pred, what, timeout = 20_000) {
      const end = Date.now() + timeout; let last;
      while (Date.now() < end) {
        try { if (await page.evaluate(() => !!window.__game)) { last = await h.state(); if (pred(last)) return last; } } catch (e) { last = e.message; }
        await wait(150);
      }
      throw new Error(`timed out waiting for ${what} (last state: ${JSON.stringify(last)?.slice(0, 300)})`);
    },
  };
  return h;
}

/** Opens a game by deep link and waits for window.__game with the given status (default 'title'). */
export async function openGame(j, page, { gameId, packId, levelId, story = false, manual = true, seed = 7, status = 'title' }) {
  await j.open(page, gameUrl(gameId, packId, levelId, { story, manual, seed }));
  const g = G(page);
  await g.waitFor((s) => s && (status == null || s.status === status), `${gameId}/${packId}/${levelId} mounted with status ${status}`, 30_000);
  assert.equal(await g.id(), gameId, `window.__game.id is ${gameId}`);
  return g;
}

/** Skips story scenes until the status is not 'story'. */
export async function skipScenes(g, max = 10) {
  for (let i = 0; i < max; i++) { const s = await g.state(); if (s.status !== 'story') return s; await g.act('skip'); }
  return g.state();
}

/** Documents of one type in a learner's personal database (D-G15). */
export async function personDocs(j, page, personKey, type) {
  return (await dbDocs(j, page, `person-${personKey}`)).filter((d) => !type || d.type === type);
}
export async function classDocs(j, page, classKey, type) {
  return (await dbDocs(j, page, `class-${classKey}`)).filter((d) => !type || d.type === type);
}
/** Waits until a new gameResult (not in `before` ids) appears for the learner; returns it. */
export async function waitNewResult(j, page, personKey, beforeIds, filter = () => true, timeout = 30_000) {
  const end = Date.now() + timeout; let last = [];
  while (Date.now() < end) {
    try {
      last = await personDocs(j, page, personKey, 'gameResult');
      const fresh = last.filter((d) => !beforeIds.has(d._id || d.id) && filter(d));
      if (fresh.length) return fresh;
    } catch {}
    await wait(500);
  }
  throw new Error(`no new gameResult in person-${personKey} within ${timeout} ms (D-G15; have ${last.length})`);
}
export const idsOf = (docs) => new Set(docs.map((d) => d._id || d.id));

/**
 * Real-time "keep playing" driver for performance rows (AC-201, AC-203): runs for `ms` of wall time with the game's
 * own clock (no clock=manual), reacting through window.__game.act; when a round ends it reopens the same deep link.
 */
export async function keepBusy(j, page, { gameId, packId, levelId, lvl, ms }) {
  const g = G(page); const end = Date.now() + ms; let tick = 0; let restarts = 0;
  const bugs = new Map((lvl?.bugs || []).map((b) => [b.line, b]));
  while (Date.now() < end) {
    tick++;
    let s;
    try { s = await g.state(); } catch { await wait(200); continue; }
    if (s.status === 'story') { await g.act('skip'); continue; }
    if (s.status === 'title') { await g.act('start'); continue; }
    if (s.status === 'paused') { await g.act('continue'); continue; }
    if (s.status === 'won' || s.status === 'lost') {
      restarts++;
      await j.open(page, gameUrl(gameId, packId, levelId, { manual: false }));
      await g.waitFor((x) => x && x.status === 'title', 'the game to reopen', 30_000);
      continue;
    }
    const x = s.extra || {};
    if (gameId === 'syntax-drop') {
      const off = x.timingOffsetMs || 0;
      if (x.mode === 'strike') {
        const p = (x.pieces || []).filter((q) => !q.decoy && Math.abs(q.hitAtMs + off - s.clockMs) <= 60)[0];
        if (p) await g.act('strike', p.key);
      } else if (x.piece && Math.abs(x.piece.hitAtMs + off - s.clockMs) <= 60) {
        const slot = (lvl?.slots || []).find((sl) => sl.accepts.includes(x.piece.pieceId) && (x.slots || []).find((y) => y.id === sl.id && !y.filled));
        if (slot) await g.act('drop', slot.id);
      }
    } else if (gameId === 'whack-a-bug') {
      const c = (x.critters || []).find((k) => k.line && k.upAt <= s.clockMs && s.clockMs < k.downAt && bugs.has(k.line));
      if (c) await g.act('whack', c.line);
    } else if (gameId === 'aftershock') {
      if (tick % 15 === 0) await g.act('run', (Math.floor(tick / 15) % 2) ? 1 : -1);
      if (tick % 25 === 0) await g.act('jump');
    } else if (gameId === 'sniper') {
      if (tick % 10 === 0) await g.act('target-next');
      const b = (x.bounties || []).find((y) => !y.claimed);
      const t = b && (x.targets || []).find((y) => y.snippetId === b.snippetId && !y.cover);
      if (t && x.aimed === t.id && x.aimError && Math.hypot(x.aimError.x, x.aimError.y) <= t.radius * 0.5) await g.act('fire');
      else if (t && x.aimed !== t.id) await g.act('aim', t.id);
      else if (t && x.aimError) await g.act('nudge', { dx: Math.sign(x.aimError.x), dy: Math.abs(x.aimError.x) < 0.5 ? Math.sign(x.aimError.y) : 0 });
    }
    await wait(40);
  }
  return { restarts };
}

// ---------- hub (SPEC §13.3 "The hub", D-70) ----------

/** IST time on class day d of a class that starts Mon 2 Nov 2026 (any number of days, e.g. the 12-day games-hub class). */
export const dayAt = (d, hm = '10:00') => Date.parse(`${new Date(Date.UTC(2026, 10, 2 + d)).toISOString().slice(0, 10)}T${hm}:00+05:30`);
/** Hub pages: nav test id suffix -> route (SPEC §13.3 Routes). */
export const HUB_PAGES = { home: '/learn/games', avatar: '/learn/games/avatar', inventory: '/learn/games/inventory', team: '/learn/games/team', story: '/learn/games/story', settings: '/learn/games/settings' };
/** Init script: records Fullscreen API calls (headless Chromium may not enter real full screen). */
export const FULLSCREEN_RECORDER = () => {
  window.__fs = { requests: 0, exits: 0, targets: [] };
  for (const name of ['requestFullscreen', 'webkitRequestFullscreen']) {
    const orig = Element.prototype[name];
    if (!orig) continue;
    Element.prototype[name] = function (...a) { window.__fs.requests++; window.__fs.targets.push(this.getAttribute?.('data-testid') || this.tagName); try { return orig.apply(this, a); } catch (e) { return Promise.resolve(); } };
  }
  for (const name of ['exitFullscreen', 'webkitExitFullscreen']) {
    const orig = Document.prototype[name];
    if (!orig) continue;
    Document.prototype[name] = function (...a) { window.__fs.exits++; try { return orig.apply(this, a); } catch (e) { return Promise.resolve(); } };
  }
};

// ---------- input layer ----------

const DIGIT = (n) => `Digit${n}`;
const KEYS = {
  common: { start: 'Enter', pause: 'p', resume: 'p', continue: 'Enter', quit: 'q', retry: 'r', back: 'Backspace', fullscreen: 'g', assist: 'h', next: 'n', skip: 'f', previous: 'b', autoplay: 'a', replay: 'l' },
  'syntax-drop': { left: 'ArrowLeft', right: 'ArrowRight', drop: 'ArrowDown', strike: (k) => DIGIT(k), power: 'e', calibrate: 'c', tap: 't', offset: (ms) => (ms < 0 ? 'Minus' : 'Equal') },
  sniper: { 'target-prev': 'z', 'target-next': 'c', nudge: ({ dx = 0, dy = 0 }) => (dx < 0 ? 'ArrowLeft' : dx > 0 ? 'ArrowRight' : dy < 0 ? 'ArrowUp' : 'ArrowDown'), breathe: 'Shift', binoculars: 'b', fire: 'Space' },
  'whack-a-bug': { whack: (line) => DIGIT(line), charge: (line) => DIGIT(line), undo: 'u', xray: 'v' },
  aftershock: { run: (d) => (d < 0 ? 'ArrowLeft' : 'ArrowRight'), jump: 'ArrowUp', dash: 'Shift', grab: 'e', place: 'ArrowDown', indent: (n) => DIGIT(n), kick: 'k' },
};
const HELD = new Set(['breathe', 'run', 'charge']);
/** Button test-id suffix for an action argument (§13.T1, r3). */
function buttonId(action, arg) {
  if (arg === undefined || arg === null || typeof arg === 'boolean') return `act-${action}`;
  if (action === 'nudge') { const { dx = 0, dy = 0 } = arg; return `act-nudge-${dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down'}`; }
  if (action === 'run') return `act-run-${arg < 0 ? 'left' : 'right'}`;
  if (action === 'offset') return `act-offset-${arg < 0 ? 'minus' : 'plus'}`;
  if (action === 'drop') return 'act-drop';
  return `act-${action}-${arg}`;
}

/**
 * controller(page, gameId, mode): { mode, do(action, arg), hold(action, arg, on) }.
 * 'act' calls window.__game.act; 'keys' uses only the keyboard; 'buttons' uses only pointer clicks on act-* buttons.
 */
export function controller(page, gameId, mode = 'act') {
  const g = G(page);
  const held = new Map();
  const keyFor = (action, arg) => {
    const k = KEYS[gameId]?.[action] ?? KEYS.common[action];
    if (k === undefined) throw new Error(`no key for action ${action} in ${gameId} (§13.T5)`);
    return typeof k === 'function' ? k(arg) : k;
  };
  const settle = () => wait(mode === 'act' ? 0 : 40);
  return {
    mode,
    async do(action, arg) {
      if (mode === 'act') return g.act(action, arg);
      if (mode === 'keys') {
        if (action === 'drop' && arg !== undefined) throw new Error('keys mode: drop takes the current slot (move with left/right first)');
        await page.keyboard.press(keyFor(action, arg)); await settle(); return true;
      }
      const b = page.getByTestId(buttonId(action, arg));
      await see(b, `on-screen button ${buttonId(action, arg)}`, 10_000);
      await b.first().click(); await settle(); return true;
    },
    /** Held actions: breathe (on/off), run (direction; 0 = stop), charge (line; off = release). */
    async hold(action, arg, on) {
      if (!HELD.has(action)) throw new Error(`${action} is not a held action`);
      if (mode === 'act') {
        if (action === 'breathe') return g.act('breathe', !!on);
        if (action === 'run') return g.act('run', on ? arg : 0);
        if (action === 'charge') return on ? g.act('charge', arg) : g.act('release');
      }
      if (mode === 'keys') {
        const k = keyFor(action, arg);
        if (on) { await page.keyboard.down(k); held.set(action, k); } else { await page.keyboard.up(held.get(action) || k); held.delete(action); }
        await settle(); return true;
      }
      if (on) {
        const b = page.getByTestId(buttonId(action, action === 'breathe' ? undefined : arg));
        await see(b, `on-screen button ${buttonId(action, arg)}`, 10_000);
        await b.first().hover(); await page.mouse.down(); held.set(action, true);
      } else { await page.mouse.up(); held.delete(action); }
      await settle(); return true;
    },
  };
}

// ---------- drivers (D-G17) ----------

/** Advances until no piece is within the Late window, so a strike there judges no piece (an action miss). */
export async function quietMoment(g) {
  for (let i = 0; i < 200; i++) {
    const s = await g.state();
    const late = T('syntaxDrop.windowLateMs') + 20;
    if (s.status === 'playing' && s.extra.pieces.length && s.extra.pieces.every((p) => Math.abs(p.hitAtMs + (s.extra.timingOffsetMs || 0) - s.clockMs) > late)) return s;
    await g.advance(20);
  }
  throw new Error('syntax-drop: no moment without a piece in its window');
}

/** Handles the shared screens a driver can meet: story (skip), lesson card (continue). */
async function shared(g, ctl, s) {
  if (s.status === 'story') { await ctl.do('skip'); return true; }
  if (s.status === 'paused') { await ctl.do('continue'); return true; }
  if (s.status === 'title') { await ctl.do('start'); return true; }
  return false;
}
const done = (s) => s.status === 'won' || s.status === 'lost';

/**
 * Syntax Drop: plays the level correctly (right slot / right key on the beat, decoys let through).
 * opts.wrongOnce: drop the first decoy into the first open slot (fill) or strike the first decoy (strike).
 * opts.maxPieces: stop after this many judged pieces (for perf runs that restart).
 */
export async function playSyntaxDrop(page, ctl, lvl, { wrongOnce = false, stopWhen = done, maxLoops = 4000, onPress } = {}) {
  const g = G(page); const pieces = new Map((lvl.pieces || []).map((p) => [p.id, p]));
  let wrongDone = !wrongOnce;
  for (let i = 0; i < maxLoops; i++) {
    let s = await g.state();
    if (stopWhen(s)) return s;
    if (await shared(g, ctl, s)) continue;
    const x = s.extra; const off = x.timingOffsetMs || 0;
    if (x.mode === 'fill') {
      const p = x.piece;
      if (!p) { await g.advance(50); continue; }
      const def = pieces.get(p.pieceId) || {};
      let slot = (lvl.slots || []).find((sl) => (sl.accepts || []).includes(p.pieceId) && x.slots.find((y) => y.id === sl.id && !y.filled));
      if (def.decoy) {
        if (wrongDone) { await g.advanceGame(Math.max(20, p.hitAtMs + off + T('syntaxDrop.windowLateMs') + 20 - s.clockMs)); continue; }
        slot = x.slots.find((y) => !y.filled); wrongDone = true;
      }
      if (!slot) { await g.advanceGame(Math.max(20, p.hitAtMs + off + T('syntaxDrop.windowLateMs') + 20 - s.clockMs)); continue; }
      if (ctl.mode === 'act') { await g.advanceGame(p.hitAtMs + off - s.clockMs); await ctl.do('drop', slot.id); onPress?.(p, slot.id); continue; }
      for (let k = 0; k < 12 && s.extra.piece?.over !== slot.id; k++) {
        const order = x.slots.map((y) => y.id); const want = order.indexOf(slot.id); const at = order.indexOf(s.extra.piece?.over);
        await ctl.do(at < want ? 'right' : 'left'); s = await g.state();
      }
      await g.advanceGame(p.hitAtMs + off - s.clockMs); await ctl.do('drop'); onPress?.(p, slot.id);
      continue;
    }
    // strike
    const live = (x.pieces || []).filter((p) => p.hitAtMs + off >= s.clockMs - T('syntaxDrop.windowPerfectMs'));
    const real = live.filter((p) => !p.decoy).sort((a, b) => a.hitAtMs - b.hitAtMs);
    const decoy = live.filter((p) => p.decoy).sort((a, b) => a.hitAtMs - b.hitAtMs);
    let target = real[0];
    if (!wrongDone && decoy[0] && (!target || decoy[0].hitAtMs <= target.hitAtMs)) { target = decoy[0]; wrongDone = true; }
    if (!target) { await g.advance(50); continue; }
    await g.advanceGame(target.hitAtMs + off - s.clockMs);
    await ctl.do('strike', target.key); onPress?.(target);
  }
  throw new Error('syntax-drop driver: the level did not finish');
}

/** Whack-a-Bug: whacks bug rows only (smash when armored). opts.wrongLine: whack this healthy line once first, then undo it. */
export async function playWhack(page, ctl, lvl, { wrongLine = null, useXray = false, stopWhen = done, maxLoops = 4000 } = {}) {
  const g = G(page); const program = String(lvl.program).split('\n');
  const bugLines = new Map(lvl.bugs.map((b) => [b.line, b]));
  let wrongDone = wrongLine == null;
  for (let i = 0; i < maxLoops; i++) {
    const s = await g.state();
    if (stopWhen(s)) return s;
    if (await shared(g, ctl, s)) continue;
    const x = s.extra; const now = s.clockMs;
    const up = (x.critters || []).filter((c) => c.line != null && c.upAt <= now && now < c.downAt - 20);
    const isBug = (c) => bugLines.has(c.line) && x.lines[c.line - 1] !== bugLines.get(c.line).fix;
    let c = !wrongDone ? up.find((k) => k.line === wrongLine) : null;
    if (c) { // the planted Knowledge mistake: flatten a healthy row, then restore it with the undo token
      wrongDone = true;
      await ctl.do('whack', c.line);
      await ctl.do('undo');
      continue;
    }
    c = up.find(isBug);
    if (!c) { await g.advance(40); continue; }
    if (useXray && x.xray?.charges > 0 && !(x.xray.untilMs > now)) await ctl.do('xray');
    if (c.armored) {
      await ctl.hold('charge', c.line, true);
      await g.advanceGame((T('whack.smashMinMs') + T('whack.smashMaxMs')) / 2);
      await ctl.hold('charge', c.line, false);
    } else if (ctl.mode === 'buttons') await ctl.do('whack', c.line);
    else await ctl.do('whack', c.line);
  }
  throw new Error('whack-a-bug driver: the level did not finish');
}

/** Sniper: aims (target-next / aim), steadies with breath, nudges inside the radius, fires. */
export async function shoot(page, ctl, targetId, { miss = false } = {}) {
  const g = G(page);
  let s = await g.state();
  if (ctl.mode === 'act') await ctl.do('aim', targetId);
  else for (let k = 0; k < 20 && s.extra.aimed !== targetId; k++) { await ctl.do('target-next'); s = await g.state(); }
  s = await g.state();
  if (s.extra.aimed !== targetId) throw new Error(`sniper: could not aim at ${targetId} (aimed ${s.extra.aimed})`);
  if (s.extra.binoculars) await ctl.do('binoculars');
  // with clock=manual the sway does not move while nudging; breath is held only where it cannot clash with clicks
  const breathe = ctl.mode !== 'buttons';
  if (breathe) await ctl.hold('breathe', null, true);
  const step = T('sniper.nudgeStep');
  for (let k = 0; k < 60; k++) {
    s = await g.state(); const e = s.extra.aimError; const t = s.extra.targets.find((x) => x.id === targetId);
    if (!e || !t) break;
    const goal = miss ? t.radius * 3 : t.radius * 0.5;
    const d = Math.hypot(e.x, e.y);
    if (miss ? d >= goal : d <= goal) break;
    const sx = miss ? -Math.sign(e.x || 1) : Math.sign(e.x); const sy = miss ? 0 : Math.sign(e.y);
    if (Math.abs(e.x) >= step / 2 || miss) await ctl.do('nudge', { dx: sx, dy: 0 });
    else if (Math.abs(e.y) >= step / 2) await ctl.do('nudge', { dx: 0, dy: sy });
    else break;
  }
  await ctl.do('fire');
  if (breathe) await ctl.hold('breathe', null, false);
  return g.state();
}
/** Plays a bounty level: shoots the right target for each unclaimed bounty. opts.wrongTarget: shoot this target once first. */
export async function playSniper(page, ctl, { wrongTarget = null, stopWhen = done, maxLoops = 400 } = {}) {
  const g = G(page); let wrongDone = wrongTarget == null;
  const outs = snippetOutputs().snippets || {};
  for (let i = 0; i < maxLoops; i++) {
    const s = await g.state();
    if (stopWhen(s)) return s;
    if (await shared(g, ctl, s)) continue;
    const x = s.extra;
    if (x.scatterUntilMs > s.clockMs) { await g.advanceGame(x.scatterUntilMs - s.clockMs + 20); continue; }
    let id = null;
    if (!wrongDone) { id = wrongTarget; wrongDone = true; }
    else if (x.boss) {
      const want = x.boss.callout?.output;
      const plate = x.boss.plates.find((p) => !p.open && outs[p.snippetId] === want) || x.boss.plates.find((p) => !p.open);
      id = plate?.id;
    } else {
      const b = x.bounties.find((y) => !y.claimed);
      id = b && x.targets.find((t) => t.snippetId === b.snippetId && !t.cover)?.id;
    }
    if (!id) { await g.advance(100); continue; }
    await shoot(page, ctl, id);
  }
  throw new Error('sniper driver: the level did not finish');
}

/** Aftershock: builds the stack in `order` (indexes into lvl.lines); opts.decoyAt: place decoy i at that stack position. */
export async function playAftershock(page, ctl, lvl, { order = lvl.lines.map((_, i) => i), indents = null, decoyAt = null, stopWhen = done, maxLoops = 6000 } = {}) {
  const g = G(page);
  const plan = order.map((i, k) => ({ text: lvl.lines[i].text, indent: indents ? indents[k] : lvl.lines[i].indent }));
  if (decoyAt) plan.splice(decoyAt.position, 1, { text: lvl.decoys[decoyAt.decoy].text, indent: decoyAt.indent ?? 1, decoy: true });
  const reach = T('aftershock.reachTiles');
  let running = 0;
  const run = async (dir) => { if (dir === running) return; if (running) await ctl.hold('run', running, false); if (dir) await ctl.hold('run', dir, true); running = dir; };
  for (let i = 0; i < maxLoops; i++) {
    const s = await g.state();
    if (stopWhen(s)) { await run(0); return s; }
    if (await shared(g, ctl, s)) continue;
    const x = s.extra; const p = x.player;
    const need = plan[x.stack.length];
    if (!need) { await run(0); await g.advance(100); continue; }
    // dodge debris falling onto the player
    const threat = (x.debris || []).find((d) => Math.abs(d.x - p.x) < 1 && d.y > p.y && d.y - p.y < 4);
    if (threat) { await run(threat.x <= p.x ? 1 : -1); await g.advanceGame(150); continue; }
    if (p.carrying) {
      const held = x.slabs.find((sl) => sl.state === 'held');
      if (held && held.text.trim() !== need.text.trim()) { await run(0); await ctl.do('kick'); continue; }
      const mid = (x.buildZone.x0 + x.buildZone.x1) / 2;
      if (p.x < x.buildZone.x0 || p.x > x.buildZone.x1) { await run(p.x < mid ? 1 : -1); await g.advanceGame(50); continue; }
      await run(0);
      if (x.heldIndent !== need.indent) await ctl.do('indent', need.indent);
      await ctl.do('place');
      continue;
    }
    const slab = x.slabs.filter((sl) => (sl.state === 'falling' || sl.state === 'landed') && sl.text.trim() === need.text.trim())
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (!slab) { await run(0); await g.advance(50); continue; }
    if (Math.abs(slab.x - p.x) > reach * 0.8) { await run(slab.x > p.x ? 1 : -1); await g.advanceGame(40); continue; }
    await run(0);
    if (slab.y > T('aftershock.jumpTiles')) { await g.advanceGame(40); continue; }
    await ctl.do('grab');
  }
  await run(0);
  throw new Error('aftershock driver: the level did not finish');
}

export { tid, see, wait };
