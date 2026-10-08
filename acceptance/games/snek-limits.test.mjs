// AC-210 Snek limits: an infinite loop stops at maxOps (TooManySteps), deep recursion at maxDepth (TooDeep), a huge
// list at maxCells (TooBig); each message contains the limit (games contract Appendix G-F); none hangs or crashes.
// Each case runs in a worker thread with a 512 MB heap cap and a 20 s timeout, so a hang or crash fails the test
// instead of the suite. After the three limits, the same worker runs a small program to show it still works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { FIXTURES } from '../lib/paths.mjs';
import { snek, SNEK_ENTRY, sentenceProblem } from '../lib/snek.mjs';

const { cases } = JSON.parse(readFileSync(join(FIXTURES, 'games', 'snek', 'limits.json'), 'utf8'));

function inWorker(source, opts, ms = 20_000) {
  const code = `
    const { parentPort, workerData } = require('node:worker_threads');
    import(workerData.entry).then((m) => {
      const t0 = Date.now();
      const c = m.compile(workerData.source);
      if (!c.ok) { parentPort.postMessage({ compileError: c.error }); return; }
      const r = m.run(c.program, workerData.opts);
      const after = m.run(m.compile('print(6 * 7)\\n').program, {});
      parentPort.postMessage({ r: { ok: r.ok, error: r.error, ops: r.ops, peakCells: r.peakCells }, ms: Date.now() - t0, after: after.stdout });
    }).catch((e) => parentPort.postMessage({ thrown: String(e && e.stack || e) }));`;
  return new Promise((resolve, reject) => {
    const w = new Worker(code, { eval: true, workerData: { entry: pathToFileURL(SNEK_ENTRY).href, source, opts }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    const t = setTimeout(() => { w.terminate(); reject(new Error(`Snek did not stop within ${ms} ms (it must never hang, AC-210)`)); }, ms);
    w.once('message', (m) => { clearTimeout(t); w.terminate(); resolve(m); });
    w.once('error', (e) => { clearTimeout(t); reject(new Error(`Snek crashed the worker: ${e.message} (AC-210)`)); });
    w.once('exit', (c) => { clearTimeout(t); if (c !== 0 && c !== 1) reject(new Error(`worker exited ${c}`)); });
  });
}

for (const c of cases) {
  test(`AC-210 ${c.id}: stops with ${c.kind} and a message containing ${c.keyword}, without hanging`, { timeout: 30_000 }, async () => {
    await snek(); // clear error when the entry is missing
    const m = await inWorker(c.source, c.opts);
    assert.ok(!m.thrown, `Snek threw instead of returning a RunResult: ${m.thrown}`);
    assert.ok(!m.compileError, `the ${c.id} program must compile: ${JSON.stringify(m.compileError)}`);
    assert.equal(m.r.ok, false, 'the run is stopped');
    assert.equal(m.r.error?.kind, c.kind, 'error kind');
    assert.ok(String(m.r.error?.message).includes(c.keyword), `message ${JSON.stringify(m.r.error?.message)} contains ${c.keyword}`);
    assert.equal(sentenceProblem(m.r.error?.message), null, `one plain sentence: ${JSON.stringify(m.r.error?.message)}`);
    if (c.kind === 'TooManySteps') assert.ok(m.r.ops >= c.opts.maxOps && m.r.ops <= c.opts.maxOps + 100, `ops stop at maxOps (${m.r.ops})`);
    if (c.kind === 'TooBig') assert.ok(m.r.peakCells <= c.opts.maxCells + 100, `peakCells stays near maxCells (${m.r.peakCells})`);
    assert.equal(m.after, '42\n', 'the interpreter still works after the limit');
  });
}
