// PouchDB from the APP's node_modules (SPEC D-6), with the in-memory adapter for test clients.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { APP_ROOT } from './paths.mjs';

let cached;
export function loadPouch() {
  if (cached) return cached;
  const req = createRequire(join(APP_ROOT, 'package.json'));
  let PouchDB, memory;
  try { PouchDB = req('pouchdb'); memory = req('pouchdb-adapter-memory'); }
  catch (e) { throw new Error(`pouchdb / pouchdb-adapter-memory not resolvable from app root ${APP_ROOT} (SPEC D-6): ${e.message}`); }
  PouchDB = PouchDB.default || PouchDB;
  PouchDB.plugin(memory.default || memory);
  cached = PouchDB;
  return PouchDB;
}
let n = 0;
/** A local in-memory database. */
export function localDb(name = 'local') { const P = loadPouch(); return new P(`${name}-${process.pid}-${++n}`, { adapter: 'memory' }); }
/** A remote database on the hub, authenticated with a session cookie; extraHeaders are added to every request. */
export function remoteDb(url, cookie, extraHeaders = {}) {
  const P = loadPouch();
  return new P(url, {
    skip_setup: true,
    fetch: (u, o) => { o.headers.set('cookie', cookie); for (const [k, v] of Object.entries(extraHeaders)) o.headers.set(k, v); return P.fetch(u, o); },
  });
}
/** One-shot replication with a hard timeout. */
export async function replicate(from, to, ms = 20000) {
  const P = loadPouch();
  let rep;
  const timer = new Promise((_, rej) => setTimeout(() => { try { rep?.cancel(); } catch {} rej(new Error(`replication timed out after ${ms} ms`)); }, ms).unref());
  rep = P.replicate(from, to, { retry: false });
  return Promise.race([rep, timer]);
}
