// AC-234 Story check: `games check packages/games/story` passes; each broken story fixture fails with a problem line
// containing its keyword (unknown beat type, missing en.json key, unknown speaker, missing required scene, intro
// length out of range) (games contract D-G20, §13.T4 story-check rules, Appendix G-F).
// Fixtures: acceptance/fixtures/games/story/broken/*.json with index.json (file -> keyword).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GFIX, STORY_DIR, FIRST_WAVE, runCli, problemLines, readJson } from '../lib/games.mjs';

test('AC-234 the story files exist and `games check packages/games/story` passes', { timeout: 60_000 }, async () => {
  assert.ok(existsSync(join(STORY_DIR, 'universe.json')), 'packages/games/story/universe.json (D-G20)');
  for (const g of FIRST_WAVE) assert.ok(existsSync(join(STORY_DIR, `${g}.json`)), `packages/games/story/${g}.json`);
  const universe = readJson(join(STORY_DIR, 'universe.json'));
  assert.ok(universe.scenes?.prologue, 'universe.json has the prologue scene');
  for (const g of FIRST_WAVE) {
    const s = readJson(join(STORY_DIR, `${g}.json`));
    assert.ok(s.scenes?.intro && s.scenes?.['chapter-end'], `${g}.json has intro and chapter-end`);
  }
  const r = await runCli(['games', 'check', STORY_DIR]);
  assert.equal(problemLines(r.out).length, 0, `no problems:\n${r.out.slice(0, 2000)}`);
  assert.equal(r.code, 0, 'exit 0');
});

const { cases } = readJson(join(GFIX, 'story', 'broken', 'index.json'));
for (const [file, keyword] of Object.entries(cases)) {
  test(`AC-234 broken story ${file} fails with a problem line containing "${keyword}"`, { timeout: 60_000 }, async () => {
    const r = await runCli(['games', 'check', join(GFIX, 'story', 'broken', file)]);
    assert.equal(r.code, 1, `exit 1 (out: ${r.out.slice(0, 500)})`);
    const lines = problemLines(r.out);
    assert.ok(lines.some((l) => l.includes(keyword)), `a problem line contains ${JSON.stringify(keyword)}:\n${lines.join('\n')}`);
  });
}
