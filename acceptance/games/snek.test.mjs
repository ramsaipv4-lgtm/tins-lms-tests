// AC-208 Snek runs the 120-program fixture corpus exactly as CPython 3.14 does (SPEC-games G4; games contract
// §13.T2 Snek API, §13.T3 language, D-G12).
// Fixture: acceptance/fixtures/games/snek/corpus.json, built by fixtures/games/build_fixtures.py with python3 -I; every
// program is inside the Snek subset (checked by the builder) and its stdout is what CPython printed. input() lines
// come from opts.input. stdout must match exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES } from '../lib/paths.mjs';
import { snek } from '../lib/snek.mjs';

const corpus = JSON.parse(readFileSync(join(FIXTURES, 'games', 'snek', 'corpus.json'), 'utf8'));

test('AC-208 the fixture corpus holds 120 programs recorded with CPython 3.14', () => {
  assert.equal(corpus.programs.length, 120, 'corpus size');
  assert.match(corpus.oracle, /^CPython 3\.14\./, 'oracle version recorded (D-G12)');
  assert.equal(new Set(corpus.programs.map((p) => p.id)).size, 120, 'unique ids');
});

test('AC-208 every corpus program prints exactly the expected stdout', { timeout: 120_000 }, async () => {
  const { compile, run } = await snek();
  const failures = [];
  for (const p of corpus.programs) {
    let c;
    try { c = compile(p.source); } catch (e) { failures.push(`${p.id}: compile threw ${e.message}`); continue; }
    if (!c?.ok) { failures.push(`${p.id}: does not compile: ${JSON.stringify(c?.error)}`); continue; }
    let r;
    try { r = run(c.program, { input: p.input, maxOps: 20_000_000, maxCells: 1_000_000 }); } catch (e) { failures.push(`${p.id}: run threw ${e.message}`); continue; }
    if (!r?.ok) { failures.push(`${p.id}: run failed: ${JSON.stringify(r?.error)}`); continue; }
    if (r.stdout !== p.stdout) failures.push(`${p.id}: stdout differs\n    expected ${JSON.stringify(p.stdout)}\n    got      ${JSON.stringify(r.stdout)}`);
    if (!Number.isInteger(r.ops) || !Number.isInteger(r.peakCells)) failures.push(`${p.id}: RunResult needs integer ops and peakCells (§13.T2)`);
  }
  assert.equal(failures.length, 0, `${failures.length} of 120 corpus programs failed:\n  ${failures.slice(0, 15).join('\n  ')}`);
});
