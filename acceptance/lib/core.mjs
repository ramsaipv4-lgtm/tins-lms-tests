// Loads the app's core module (SPEC §2). Fails with a clear message when it does not exist yet.
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CORE_ENTRY } from './paths.mjs';

if (!existsSync(CORE_ENTRY)) throw new Error(`core entry not found: ${CORE_ENTRY} (SPEC §2)`);
export const core = await import(pathToFileURL(CORE_ENTRY).href);
/** Returns the named export or throws a clear error naming the SPEC function. */
export function fn(name) {
  if (typeof core[name] !== 'function') throw new Error(`packages/core must export function "${name}" (SPEC §4)`);
  return core[name];
}
export const enc = (s) => new TextEncoder().encode(s);
export const dec = (b) => new TextDecoder().decode(b);
