// SPEC §6.2: AC-103 `lms loadtest --learners 200 --target <url>` against a local hub (summary fields in adapters/CONTRACT.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { useServer } from '../lib/api.mjs';
import { APP_ROOT } from '../lib/paths.mjs';

const CLI = join(APP_ROOT, 'packages', 'cli', 'src', 'main.ts');
const S = useServer({ seed: null });

function runCli(args, ms) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [CLI, ...args], { cwd: APP_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`loadtest did not finish within ${ms} ms\n${out.slice(-2000)}\n${err.slice(-2000)}`)); }, ms);
    child.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err }); });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

test('AC-103 200 simulated learners sign in, mark attendance, answer a live quiz within 10 s and sync; 95% of requests within 1 s; no lost writes', { timeout: 60_000 }, async () => {
  if (!existsSync(CLI)) throw new Error(`cli entry not found: ${CLI} (SPEC D-2, AC-103)`);
  const srv = S();
  const { code, out, err } = await runCli(['loadtest', '--learners', '200', '--target', srv.url], 55_000);
  const last = out.trim().split(/\r?\n/).at(-1) || '';
  let s; try { s = JSON.parse(last); } catch { throw new Error(`last stdout line is not a JSON summary: ${last.slice(0, 300)}\nstderr: ${err.slice(-1000)}`); }
  assert.equal(s.learners, 200, 'learners');
  assert.ok(Number.isInteger(s.requests) && s.requests >= 800, `requests counted (sign-in, attendance, answer, sync per learner): ${s.requests}`);
  assert.equal(s.quizAnswers, 200, '200 quiz answers recorded');
  assert.ok(Number.isFinite(s.quizWindowMs) && s.quizWindowMs <= 10_000, `200 answers within 10 s: ${s.quizWindowMs}`);
  assert.ok(Number.isFinite(s.within1sPct) && s.within1sPct >= 95, `95% of requests within 1 s: ${s.within1sPct}`);
  assert.equal(s.lostWrites, 0, 'no write lost');
  assert.equal(s.pass, true, 'summary says pass');
  assert.equal(code, 0, 'loadtest exits 0 on pass');
});
