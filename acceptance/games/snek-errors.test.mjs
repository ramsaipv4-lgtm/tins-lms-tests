// AC-209 Snek errors are friendly and located: kind, line and a one-sentence message containing the required
// keyword (games contract D-G13, Appendix G-F; never the exact wording).
// Fixture: acceptance/fixtures/games/snek/errors.json (lines and exception classes cross-checked with CPython by
// build_fixtures.py). Compile-phase errors come from compile() as { ok: false, error }; run-phase errors from run().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES } from '../lib/paths.mjs';
import { snek, sentenceProblem } from '../lib/snek.mjs';

const { cases } = JSON.parse(readFileSync(join(FIXTURES, 'games', 'snek', 'errors.json'), 'utf8'));

for (const c of cases) {
  test(`AC-209 ${c.id}: ${c.kind} on line ${c.line} with a plain sentence naming "${c.keyword}"`, async () => {
    const { compile, run } = await snek();
    const comp = compile(c.source);
    let err;
    if (c.phase === 'compile') {
      assert.equal(comp.ok, false, `compile() must refuse the ${c.id} program`);
      err = comp.error;
    } else {
      assert.equal(comp.ok, true, `the ${c.id} program compiles: ${JSON.stringify(comp.error)}`);
      const r = run(comp.program, { maxOps: 100_000 });
      assert.equal(r.ok, false, `run() must report the ${c.id} error`);
      err = r.error;
    }
    assert.ok(err && typeof err === 'object', 'error object { kind, line, col, message }');
    assert.equal(err.kind, c.kind, 'error kind');
    assert.equal(err.line, c.line, 'error line (1-based)');
    assert.ok(Number.isInteger(err.col) && err.col >= 1, `error col is a 1-based integer, got ${err.col}`);
    assert.ok(String(err.message).includes(c.keyword), `message ${JSON.stringify(err.message)} contains ${JSON.stringify(c.keyword)}`);
    const why = sentenceProblem(err.message);
    assert.equal(why, null, `message must be one plain sentence: ${why} (${JSON.stringify(err.message)})`);
  });
}
