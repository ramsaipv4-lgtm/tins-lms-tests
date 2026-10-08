// Loads the Snek interpreter (games contract §13.T2, D-G11): packages/games/src/lang/index.ts, exporting
// compile, run, step and callFunction. Fails with one clear message when it does not exist yet.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ROOT } from './paths.mjs';

export const SNEK_ENTRY = join(APP_ROOT, 'packages', 'games', 'src', 'lang', 'index.ts');

let cache = null;
/** Returns { compile, run, step, callFunction } or throws naming the contract. */
export async function snek() {
  if (cache) return cache;
  if (!existsSync(SNEK_ENTRY)) throw new Error(`Snek entry not found: ${SNEK_ENTRY} (games contract §13.T2, D-G11)`);
  const m = await import(pathToFileURL(SNEK_ENTRY).href);
  for (const name of ['compile', 'run', 'step', 'callFunction']) {
    if (typeof m[name] !== 'function') throw new Error(`packages/games/src/lang/index.ts must export function "${name}" (games contract §13.T2)`);
  }
  cache = m;
  return m;
}

/** compile(source) and fail with the error if it does not compile. Returns the Program. */
export async function compileOk(source, what = 'program') {
  const { compile } = await snek();
  const c = compile(source);
  if (!c || typeof c !== 'object' || !('ok' in c)) throw new Error(`compile() must return { ok, program | error } (§13.T2), got ${JSON.stringify(c)?.slice(0, 200)}`);
  if (!c.ok) throw new Error(`${what} should compile, got ${JSON.stringify(c.error)}`);
  return c.program;
}

/** Checks the D-G13 message rule: one plain sentence. Returns a reason string or null. */
export function sentenceProblem(message) {
  if (typeof message !== 'string' || !message.trim()) return 'message is empty or not a string';
  const m = message.trim();
  if (/[\r\n]/.test(m)) return 'message has a line break';
  if (m.length > 160) return `message is ${m.length} characters (max 160)`;
  if (!/[.!?]$/.test(m)) return 'message does not end with . ! or ?';
  if (/\bundefined\b|\bnull\b|\bNaN\b|\[object|\n\s+at\s|\bat .*:\d+:\d+/.test(m)) return 'message leaks JavaScript internals';
  return null;
}

/** Fills {{KEY}} placeholders. */
export const fillTemplate = (src, vars) => src.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`no value for {{${k}}}`); return String(vars[k]); });
