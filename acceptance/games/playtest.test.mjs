// AC-243 Syntax Drop, AC-244 Snippet Sniper, AC-245 Whack-a-Bug, AC-246 Aftershock: MANUAL playtest sign-off
// (games contract D-G22). The owner plays the game for 10 minutes from the task's worktree build and commits
// acceptance/games/signoff/<gameId>.json; the orchestrator then adds the row to that task, closes and merges it.
// Each test checks only its own game's file, so an unsigned game blocks only its own task.
// Sign-off format: { "gameId": "<id>", "by": "<name>", "at": "<ISO date>", "minutes": >= 10, "profile": "desktop|phone",
//   "commit": "<7-40 hex of the build played>", "keptPlaying": true, "notes": "<text>" }
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'signoff');
const ROWS = { 'AC-243': 'syntax-drop', 'AC-244': 'sniper', 'AC-245': 'whack-a-bug', 'AC-246': 'aftershock' };

for (const [ac, gameId] of Object.entries(ROWS)) {
  test(`${ac} MANUAL: the owner's 10-minute playtest of ${gameId} is signed off ("I wanted to keep playing")`, () => {
    const file = join(DIR, `${gameId}.json`);
    assert.ok(existsSync(file), `${ac}: no sign-off yet at acceptance/games/signoff/${gameId}.json; the owner plays ${gameId} for 10 minutes and commits it (D-G22)`);
    const s = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(s.gameId, gameId, 'gameId');
    assert.ok(typeof s.by === 'string' && s.by.trim(), 'by: who played');
    assert.ok(!Number.isNaN(Date.parse(s.at)), 'at: an ISO date');
    assert.ok(Number(s.minutes) >= 10, 'minutes >= 10');
    assert.ok(['desktop', 'phone'].includes(s.profile), 'profile desktop or phone');
    assert.match(String(s.commit), /^[0-9a-f]{7,40}$/, 'commit of the build played');
    assert.equal(s.keptPlaying, true, '"I wanted to keep playing"');
    assert.equal(typeof s.notes, 'string', 'notes');
  });
}
