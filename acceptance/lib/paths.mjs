// Paths resolved relative to the app repo root (the parent of acceptance/).
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
export const ACCEPTANCE = resolve(here, '..');
// When acceptance/ is a symlink, the app root is the cwd the suite was started from.
export const APP_ROOT = process.env.LMS_APP_ROOT ? resolve(process.env.LMS_APP_ROOT) : process.cwd();
export const FIXTURES = join(ACCEPTANCE, 'fixtures');
export const CORE_ENTRY = join(APP_ROOT, 'packages', 'core', 'src', 'index.ts');
export const SERVER_ENTRY = join(APP_ROOT, 'packages', 'server', 'src', 'main.ts');
export function real(p) { try { return realpathSync(p); } catch { return p; } }
