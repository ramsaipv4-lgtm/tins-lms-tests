// Loads adapter modules from packages/adapters/src (SPEC §7; surface in acceptance/adapters/CONTRACT.md).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ROOT } from './paths.mjs';

export async function loadAdapter(name) {
  const p = join(APP_ROOT, 'packages', 'adapters', 'src', `${name}.ts`);
  if (!existsSync(p)) throw new Error(`adapter entry not found: ${p} (SPEC §7, acceptance/adapters/CONTRACT.md)`);
  return import(pathToFileURL(p).href);
}
export function need(mod, name) {
  if (typeof mod[name] !== 'function') throw new Error(`adapter module must export function "${name}" (acceptance/adapters/CONTRACT.md)`);
  return mod[name];
}
/** Resolves to { ok:false, reason } when fn rejects, else to its result. Lets tests accept "reports" as either style. */
export async function settle(p) { try { return await p; } catch (e) { return { ok: false, reason: String(e?.message || e), thrown: true }; } }
