// SPEC §4.17 Explain-it-back concept check: AC-34.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const CHECKLIST = {
  concepts: [
    { id: 'dns', anyOf: ['domain name system', 'dns'] },
    { id: 'ttl', anyOf: ['time to live', 'ttl'] },
    { id: 'cache', anyOf: ['cache'] },
    { id: 'resolver', anyOf: ['resolver', 'recursive server'] },
  ],
  misconceptions: [
    { id: 'instant-propagation', anyOf: ['changes instantly', 'updates immediately'] },
    { id: 'dns-is-http', anyOf: ['dns uses http'] },
  ],
};
const sorted = (a) => [...a].sort();

test('AC-34 synonyms cover concepts, absent ones are missing, misconceptions are reported', () => {
  const check = fn('checkExplanation');
  const t = 'When you type a name, the DOMAIN NAME SYSTEM finds the address. Each answer has a Time to Live, '
    + 'and it is cached for that long. Honestly, I think a record change updates immediately everywhere!';
  const r = check(t, CHECKLIST);
  assert.deepEqual(sorted(r.covered), ['dns', 'ttl']);
  assert.deepEqual(sorted(r.missing), ['cache', 'resolver'], '"cached" must not match "cache"');
  assert.deepEqual(r.misconceptions, ['instant-propagation']);
});

test('AC-34 matching ignores case and punctuation and needs whole words', () => {
  const check = fn('checkExplanation');
  const r = check('The resolver asks others; its cache (TTL) helps. DNS!', CHECKLIST);
  assert.deepEqual(sorted(r.covered), ['cache', 'dns', 'resolver', 'ttl']);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.misconceptions, []);
  const partial = check('The resolvers use a cachet and dnssec over a recursive servers farm', CHECKLIST);
  assert.deepEqual(partial.covered, [], 'partial words never match');
  assert.deepEqual(sorted(partial.missing), ['cache', 'dns', 'resolver', 'ttl']);
  const listed = check('It is cached.', { concepts: [{ id: 'cache', anyOf: ['cache', 'cached'] }], misconceptions: [] });
  assert.deepEqual(listed.covered, ['cache'], '"cached" matches when listed');
});
