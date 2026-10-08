// AC-216 `games new <gameId> x` writes games/<gameId>/x.json (under --dir) that passes `games check`, for every
// first-wave game id; it refuses to overwrite (SPEC §13.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCli, tempDir, readJson } from '../lib/games.mjs';

const GAME_IDS = ['syntax-drop', 'sniper', 'whack-a-bug', 'aftershock']; // first wave (SPEC AC-216)

for (const id of GAME_IDS) {
  test(`AC-216 games new ${id} x writes a pack that passes games check`, { timeout: 60_000 }, async () => {
    const dir = tempDir('lms-packnew-');
    const r = await runCli(['games', 'new', id, 'x', '--dir', dir]);
    assert.equal(r.code, 0, `games new exits 0 (${r.err.slice(0, 300)})`);
    const file = join(dir, 'games', id, 'x.json');
    assert.ok(existsSync(file), `writes ${file}`);
    assert.ok(r.out.includes(join('games', id, 'x.json')), 'prints the path it wrote');
    const pack = readJson(file);
    assert.equal(pack.game, id, 'pack.game');
    assert.equal(pack.id, 'x', 'pack.id');
    const c = await runCli(['games', 'check', file]);
    assert.equal(c.code, 0, `the starter pack passes games check:\n${c.out.slice(0, 1000)}`);
    const again = await runCli(['games', 'new', id, 'x', '--dir', dir]);
    assert.equal(again.code, 1, 'refuses to overwrite an existing pack');
  });
}
