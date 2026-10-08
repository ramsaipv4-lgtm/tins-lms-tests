// AC-211 Snek counting is deterministic: the same program gives the same ops and peakCells on every run; from n = 100
// to n = 1000, ops grow >= 80x for bubble sort and <= 15x for merge sort (SPEC-games G4 counting, D-G4).
// Fixtures: acceptance/fixtures/games/snek/sorts/{bubble,merge}.snek; the input is built inside the program by a
// small LCG (no JS-to-Snek conversion), and the program prints the first, last and length of the sorted list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES } from '../lib/paths.mjs';
import { snek, compileOk, fillTemplate } from '../lib/snek.mjs';

const tmpl = (name) => readFileSync(join(FIXTURES, 'games', 'snek', 'sorts', `${name}.snek`), 'utf8');
function expected(n) { // the same LCG in JS
  let seed = 12345; const xs = [];
  for (let i = 0; i < n; i++) { seed = (seed * 75 + 74) % 65537; xs.push(seed % 1000); }
  xs.sort((a, b) => a - b);
  return `${xs[0]} ${xs[n - 1]} ${n}\n`;
}
async function measure(name, n, times) {
  const { run } = await snek();
  const prog = await compileOk(fillTemplate(tmpl(name), { N: n }), `${name} n=${n}`);
  const runs = [];
  for (let i = 0; i < times; i++) {
    const r = run(prog, { maxOps: 500_000_000, maxCells: 1_000_000 });
    assert.equal(r.ok, true, `${name} n=${n} runs: ${JSON.stringify(r.error)}`);
    assert.equal(r.stdout, expected(n), `${name} n=${n} sorts`);
    runs.push({ ops: r.ops, peakCells: r.peakCells });
  }
  for (const x of runs) assert.deepEqual(x, runs[0], `${name} n=${n}: ops and peakCells identical on every run`);
  return runs[0];
}

test('AC-211 bubble sort: deterministic counts and ops(1000) >= 80 x ops(100)', { timeout: 300_000 }, async () => {
  const a = await measure('bubble', 100, 3); const b = await measure('bubble', 1000, 2);
  assert.ok(b.ops / a.ops >= 80, `bubble sort ops ratio ${(b.ops / a.ops).toFixed(1)} (${a.ops} -> ${b.ops}) must be >= 80`);
});

test('AC-211 merge sort: deterministic counts and ops(1000) <= 15 x ops(100)', { timeout: 120_000 }, async () => {
  const a = await measure('merge', 100, 3); const b = await measure('merge', 1000, 2);
  assert.ok(b.ops / a.ops <= 15, `merge sort ops ratio ${(b.ops / a.ops).toFixed(1)} (${a.ops} -> ${b.ops}) must be <= 15`);
  assert.ok(b.peakCells > a.peakCells, 'peakCells grows with n');
});
