// AC-212 step() yields one line event per executed statement, in CPython's order, with variable snapshots, and a call
// event for each host function before it runs (games contract §13.T2).
// Fixture: acceptance/fixtures/games/snek/step.json (single-line statements only; events recorded with CPython 3.14
// sys.settrace by build_fixtures.py). Host functions are plain JS functions passed in opts.globals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES } from '../lib/paths.mjs';
import { snek, compileOk } from '../lib/snek.mjs';

const { programs } = JSON.parse(readFileSync(join(FIXTURES, 'games', 'snek', 'step.json'), 'utf8'));

for (const p of programs) {
  test(`AC-212 ${p.id}: step events match CPython's line order and variables${p.hosts.length ? ', host calls pause before running' : ''}`, async () => {
    const { step } = await snek();
    const prog = await compileOk(p.source, p.id);
    const ran = [];
    const globals = Object.fromEntries(p.hosts.map((h) => [h, (...args) => { ran.push(h); return null; }]));
    const gen = step(prog, { globals });
    const got = [];
    let r = gen.next();
    while (!r.done) {
      const ev = r.value;
      got.push(ev);
      if (ev.kind === 'call') {
        const before = ran.length;
        r = gen.next();
        assert.equal(ran.length, before + 1, `host ${ev.name} runs only on the next() after its call event`);
        continue;
      }
      r = gen.next();
    }
    assert.equal(r.value?.ok, true, `the run ends ok: ${JSON.stringify(r.value?.error)}`);
    assert.equal(r.value.stdout, p.stdout, 'stdout');
    const shape = (evs) => evs.map((e) => (e.kind === 'call' ? `call ${e.name}@${e.line}` : `line ${e.line}`));
    assert.deepEqual(shape(got), shape(p.events), 'event kinds and lines in order');
    for (let i = 0; i < p.events.length; i++) {
      const want = p.events[i];
      if (want.kind === 'line') assert.deepEqual(got[i].vars, want.vars, `vars before line ${want.line} (event ${i})`);
      else assert.deepEqual(got[i].args, want.args, `args of ${want.name} (event ${i})`);
    }
  });
}
