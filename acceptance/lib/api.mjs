// Shared helpers for API tests (SPEC §5): one server per test file, per-user clients, test routes (§5.9).
import { before, after } from 'node:test';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { start } from './server.mjs';
import { CORE_ENTRY } from './paths.mjs';
import { PLANTED_ENV, plantedIn } from './secrets.mjs';

/** Class day 0 of the seeded class starts here: 2026-11-02 09:30 Asia/Kolkata (a minute boundary). */
export const T0 = Date.UTC(2026, 10, 2, 4, 0, 0);
export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export const TEST_TIMEOUT = 60_000;
export const BASE_FIXTURE = 'api/base.json';

/**
 * Registers before/after hooks that start one server for this file, seed it and set its clock.
 * Returns a getter that throws the boot error (so every test fails with the same clear message).
 * Every server gets planted secrets in its environment; after() checks stdout never shows them (AC-120).
 */
export function useServer({ testMode = true, env = {}, seed = BASE_FIXTURE, now = T0 } = {}) {
  const h = { srv: null, err: null };
  before(async () => {
    try {
      h.srv = await start({ testMode, env: { ...PLANTED_ENV, ...env } });
      if (testMode && seed) await seedFixture(h.srv, seed);
      if (testMode && now != null) await setClock(h.srv, now);
    } catch (e) { h.err = e; }
  }, { timeout: TEST_TIMEOUT });
  after(async () => {
    if (!h.srv) return;
    await h.srv.stop();
    const leaked = plantedIn(h.srv.stdout());
    if (leaked.length) throw new Error(`AC-120: server log contains planted secret(s): ${leaked.join(', ')}`);
  });
  return () => { if (h.err) throw h.err; return h.srv; };
}

function cookieFrom(headers, prev = '') {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  if (!list.length) return prev;
  const jar = new Map(prev ? prev.split('; ').map((p) => [p.split('=')[0], p]) : []);
  for (const c of list) { const nv = c.split(';')[0]; jar.set(nv.split('=')[0], nv); }
  return [...jar.values()].join('; ');
}

/** A client with its own cookie jar. req() returns { status, json, text, bytes, headers }. */
export function client(baseUrl, cookie = '') {
  const c = {
    baseUrl, cookie,
    async req(path, { method = 'GET', body, headers = {}, timeoutMs = 30000 } = {}) {
      const h = { ...headers }; if (c.cookie) h.cookie = c.cookie;
      let payload = body;
      if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string') { payload = JSON.stringify(body); h['content-type'] ??= 'application/json'; }
      const r = await fetch(baseUrl + path, { method, body: payload, headers: h, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      c.cookie = cookieFrom(r.headers, c.cookie);
      const bytes = new Uint8Array(await r.arrayBuffer());
      const text = new TextDecoder().decode(bytes);
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text, bytes, headers: r.headers };
    },
  };
  return c;
}

/** Signs in through POST /__test/login and returns a client holding that session. */
export async function as(srv, personId, roles) {
  const c = client(srv.url);
  const r = await c.req('/__test/login', { method: 'POST', body: { personId, roles } });
  if (r.status >= 300) throw new Error(`POST /__test/login (${personId}) failed: ${r.status} ${r.text.slice(0, 300)}`);
  if (!c.cookie) throw new Error('POST /__test/login set no session cookie (SPEC §5.2: sessions are HTTP-only cookies)');
  return c;
}
export async function seedFixture(srv, fixture) {
  const r = await client(srv.url).req('/__test/seed', { method: 'POST', body: { fixture } });
  if (r.status >= 300) throw new Error(`POST /__test/seed ${fixture} failed: ${r.status} ${r.text.slice(0, 300)}`);
}
export async function setClock(srv, now) {
  const r = await client(srv.url).req('/__test/clock', { method: 'POST', body: { now } });
  if (r.status >= 300) throw new Error(`POST /__test/clock failed: ${r.status} ${r.text.slice(0, 300)}`);
}
export async function resetServer(srv) {
  const r = await client(srv.url).req('/__test/reset', { method: 'POST' });
  if (r.status >= 300) throw new Error(`POST /__test/reset failed: ${r.status} ${r.text.slice(0, 300)}`);
}

/** Depth-first search for the first value (or key/value) satisfying pred(value, key). */
export function deepFind(obj, pred, seen = new Set()) {
  if (obj === null || typeof obj !== 'object' || seen.has(obj)) return undefined;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (pred(v, k)) return v;
    const r = deepFind(v, pred, seen); if (r !== undefined) return r;
  }
  return undefined;
}
export const deepKey = (obj, key) => deepFind(obj, (_, k) => k === key);

/** Asserts a status and returns the response; message shows the body for quick diagnosis. */
export function expectStatus(r, ok, what) {
  const pass = typeof ok === 'function' ? ok(r.status) : Array.isArray(ok) ? ok.includes(r.status) : r.status === ok;
  if (!pass) throw new Error(`${what}: unexpected status ${r.status}; body: ${r.text.slice(0, 400)}`);
  return r;
}
export const is2xx = (s) => s >= 200 && s < 300;
export const is4xx = (s) => s >= 400 && s < 500;

/** Core module (SPEC §2), loaded lazily so a missing core fails only the tests that need it. */
export async function loadCore() {
  if (!existsSync(CORE_ENTRY)) throw new Error(`core entry not found: ${CORE_ENTRY} (SPEC §2)`);
  return import(pathToFileURL(CORE_ENTRY).href);
}
export const b64 = (u8) => Buffer.from(u8).toString('base64');
export const unb64 = (s) => new Uint8Array(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
