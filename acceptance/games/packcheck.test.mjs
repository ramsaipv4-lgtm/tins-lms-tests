// AC-214 `games check` passes every sample pack (and the suite's own packs) and fails each broken fixture pack with a
// problem line containing the case's keyword (SPEC §13.5, D-G13, Appendix G-F).
// CLI: node packages/cli/src/main.ts games check <dir-or-file>; problem lines are `<file>: <pack|level <id>>: <message>`,
// exit 1 on any problem; a clean run prints only `ok: <n> ...` and exits 0.
// Parts (SPEC §13.10): 'AC-214 shared: ...' = the common pack rules (missing field, concept format, repeated level id,
// shown on Syntax Drop packs) and the whole sample-pack folder; 'AC-214 <gameId>: ...' = that game's sample packs,
// the suite's own packs for it and its game-specific broken pack.
// Fixtures: acceptance/fixtures/games/packs/broken/*.json with index.json (file -> part, keyword). The maze case
// ("a maze with no path to the exit") joins with the maze contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GFIX, GPKG, SAMPLE_PACKS, runCli, problemLines, readJson } from '../lib/games.mjs';

// SPEC §13 sample packs of the first-wave games.
const SAMPLES = {
  'syntax-drop': ['html-headings', 'css-flexbox', 'matplotlib-basics', 'python-print', 'star-patterns', 'regex-starter'],
  'whack-a-bug': ['off-by-one', 'loop-bugs', 'string-bugs', 'dsa-bugs'],
  aftershock: ['loops-order', 'functions-order', 'dsa-order'],
  sniper: ['print-basics', 'lists-and-loops', 'strings', 'boss-recursion'],
};
const LINE = /^.+?: (pack|level \S+|scene \S+): .+/;
const { cases } = readJson(join(GFIX, 'packs', 'broken', 'index.json'));

function brokenCase(file, { keyword }) {
  return async () => {
    const r = await runCli(['games', 'check', join(GFIX, 'packs', 'broken', file)]);
    assert.equal(r.code, 1, `exit 1 for a broken pack (got ${r.code}; out: ${r.out.slice(0, 500)})`);
    const lines = problemLines(r.out);
    assert.ok(lines.length >= 1, 'at least one problem line');
    for (const l of lines) assert.match(l, LINE, `problem line format <file>: <pack|level <id>>: <message> — ${l}`);
    assert.ok(lines.some((l) => l.includes(keyword)), `a problem line contains ${JSON.stringify(keyword)}:\n${lines.join('\n')}`);
  };
}

test('AC-214 shared: `games check packages/games/packs` passes every sample pack present', { timeout: 120_000 }, async () => {
  assert.ok(existsSync(SAMPLE_PACKS), `sample packs folder ${SAMPLE_PACKS} (D-G18)`);
  const r = await runCli(['games', 'check', SAMPLE_PACKS], { timeoutMs: 110_000 });
  assert.equal(problemLines(r.out).length, 0, `no problem lines:\n${r.out.slice(0, 2000)}`);
  assert.equal(r.code, 0, `exit 0 (stderr: ${r.err.slice(0, 500)})`);
  assert.match(r.out, /^ok:/m, 'prints ok: <n> ...');
});
for (const [file, c] of Object.entries(cases).filter(([, c]) => c.part === 'shared')) {
  test(`AC-214 shared: broken pack ${file} fails with a problem line containing "${c.keyword}"`, { timeout: 60_000 }, brokenCase(file, c));
}

for (const [gameId, ids] of Object.entries(SAMPLES)) {
  test(`AC-214 ${gameId}: its sample packs exist and pass games check`, { timeout: 120_000 }, async () => {
    for (const id of ids) assert.ok(existsSync(join(SAMPLE_PACKS, gameId, `${id}.json`)), `sample pack packages/games/packs/${gameId}/${id}.json (SPEC §13)`);
    const r = await runCli(['games', 'check', join(SAMPLE_PACKS, gameId)], { timeoutMs: 110_000 });
    assert.equal(problemLines(r.out).length, 0, `no problem lines:\n${r.out.slice(0, 2000)}`);
    assert.equal(r.code, 0, 'exit 0');
  });
  test(`AC-214 ${gameId}: games check passes the suite's own ${gameId} packs`, { timeout: 60_000 }, async () => {
    const r = await runCli(['games', 'check', join(GPKG, 'track1', 'games', gameId)]);
    assert.equal(r.code, 0, `the suite's ${gameId} fixture packs are valid under the contract; problems:\n${r.out.slice(0, 2000)}${r.err.slice(0, 500)}`);
  });
  for (const [file, c] of Object.entries(cases).filter(([, c]) => c.part === gameId)) {
    test(`AC-214 ${gameId}: broken pack ${file} fails with a problem line containing "${c.keyword}"`, { timeout: 60_000 }, brokenCase(file, c));
  }
}
