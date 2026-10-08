// AC-213 Snek has no access to the page or Node: open, import os, __import__, eval, exec, __class__ and __globals__ are
// refused (kind NotAllowed, or SyntaxError for import os) with a plain message naming the refused thing
// (games contract Appendix G-F). Canaries: a temp file the program tries to create must not exist; no new global
// appears on globalThis; /etc/hostname's text never reaches stdout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FIXTURES } from '../lib/paths.mjs';
import { snek, sentenceProblem, fillTemplate } from '../lib/snek.mjs';

const { cases } = JSON.parse(readFileSync(join(FIXTURES, 'games', 'snek', 'sandbox.json'), 'utf8'));
const hostname = existsSync('/etc/hostname') ? readFileSync('/etc/hostname', 'utf8').trim() : '';

for (const c of cases) {
  test(`AC-213 ${c.id} is refused with a plain message naming "${c.keyword}"`, async () => {
    const { compile, run } = await snek();
    const canary = join(mkdtempSync(join(tmpdir(), 'snek-canary-')), 'CANARY');
    const src = fillTemplate(c.source, { CANARY: canary });
    const globalsBefore = new Set(Object.getOwnPropertyNames(globalThis));
    const comp = compile(src);
    let err; let stdout = '';
    if (!comp.ok) err = comp.error;
    else {
      const r = run(comp.program, { maxOps: 100_000 });
      stdout = r.stdout || '';
      assert.equal(r.ok, false, `run() must refuse ${c.id}`);
      err = r.error;
    }
    assert.ok(c.kinds.includes(err?.kind), `kind ${err?.kind} must be one of ${c.kinds.join(', ')}`);
    assert.ok(String(err.message).includes(c.keyword), `message ${JSON.stringify(err.message)} names ${c.keyword}`);
    assert.equal(sentenceProblem(err.message), null, `one plain sentence: ${JSON.stringify(err.message)}`);
    assert.equal(existsSync(canary), false, 'the program could not touch the file system');
    if (hostname) assert.ok(!stdout.includes(hostname), 'no file content reached stdout');
    const added = Object.getOwnPropertyNames(globalThis).filter((k) => !globalsBefore.has(k));
    assert.deepEqual(added, [], 'no new globals on globalThis');
  });
}
