// Runs one or more parts of the suite: node acceptance/run.mjs core|api|journeys|perf|adapters|games|smoke|all
// Lists files explicitly (passing a directory to `node --test` misbehaves on Node 22, tins-kit RF-1).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ACCEPTANCE } from './lib/paths.mjs';

const parts = process.argv.slice(2);
const all = ['core', 'api', 'adapters', 'journeys', 'perf', 'games'];
const chosen = !parts.length || parts.includes('all') ? all : parts;
const files = [];
for (const p of chosen) {
  const dir = join(ACCEPTANCE, p);
  try { statSync(dir); } catch { console.error(`no such part: ${p}`); process.exit(2); }
  for (const f of readdirSync(dir).sort()) if (/\.(test|journey)\.mjs$/.test(f)) files.push(join(dir, f));
}
if (!files.length) { console.error('no test files'); process.exit(2); }
const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
