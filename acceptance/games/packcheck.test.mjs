// AC-214 `games check` passes every sample pack (and the suite's own packs) and fails each broken fixture pack with a
// problem line containing the case's keyword (games contract §13.T4, D-G13, Appendix G-F).
// CLI: node packages/cli/src/main.ts games check <dir-or-file>; problem lines are `<file>: <pack|level <id>>: <message>`,
// exit 1 on any problem; a clean run prints only `ok: <n> ...` and exits 0.
// Fixtures: acceptance/fixtures/games/packs/broken/*.json with index.json (file -> keyword). The maze case
// ("a maze with no path to the exit") joins with the maze contract and is not checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GFIX, GPKG, SAMPLE_PACKS, runCli, problemLines, readJson } from '../lib/games.mjs';

// SPEC-games G6 sample packs of the first-wave games.
const SAMPLES = {
  'syntax-drop': ['html-headings', 'css-flexbox', 'matplotlib-basics', 'python-print', 'star-patterns', 'regex-starter'],
  'whack-a-bug': ['off-by-one', 'loop-bugs', 'string-bugs', 'dsa-bugs'],
  aftershock: ['loops-order', 'functions-order', 'dsa-order'],
  sniper: ['print-basics', 'lists-and-loops', 'strings', 'boss-recursion'],
};
const LINE = /^.+?: (pack|level \S+|scene \S+): .+/;

test('AC-214 every first-wave sample pack exists and `games check` passes all sample packs', { timeout: 120_000 }, async () => {
  for (const [g, ids] of Object.entries(SAMPLES)) for (const id of ids) assert.ok(existsSync(join(SAMPLE_PACKS, g, `${id}.json`)), `sample pack ${g}/${id} at packages/games/packs/${g}/${id}.json (D-G18)`);
  const r = await runCli(['games', 'check', SAMPLE_PACKS], { timeoutMs: 110_000 });
  assert.equal(problemLines(r.out).length, 0, `no problem lines:\n${r.out.slice(0, 2000)}`);
  assert.equal(r.code, 0, `exit 0 (stderr: ${r.err.slice(0, 500)})`);
  assert.match(r.out, /^ok:/m, 'prints ok: <n> ...');
});

test("AC-214 `games check` passes the suite's own packs", { timeout: 60_000 }, async () => {
  const r = await runCli(['games', 'check', join(GPKG, 'track1', 'games')]);
  assert.equal(r.code, 0, `the suite's fixture packs are valid under the contract; problems:\n${r.out.slice(0, 2000)}${r.err.slice(0, 500)}`);
});

const { cases } = readJson(join(GFIX, 'packs', 'broken', 'index.json'));
for (const [file, keyword] of Object.entries(cases)) {
  test(`AC-214 broken pack ${file} fails with a problem line containing "${keyword}"`, { timeout: 60_000 }, async () => {
    const r = await runCli(['games', 'check', join(GFIX, 'packs', 'broken', file)]);
    assert.equal(r.code, 1, `exit 1 for a broken pack (got ${r.code}; out: ${r.out.slice(0, 500)})`);
    const lines = problemLines(r.out);
    assert.ok(lines.length >= 1, 'at least one problem line');
    for (const l of lines) assert.match(l, LINE, `problem line format <file>: <pack|level <id>>: <message> — ${l}`);
    assert.ok(lines.some((l) => l.includes(keyword)), `a problem line contains ${JSON.stringify(keyword)}:\n${lines.join('\n')}`);
  });
}
