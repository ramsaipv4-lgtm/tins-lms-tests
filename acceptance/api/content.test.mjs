// SPEC §5.5: AC-67 package upload runs the gate; AC-68 sealed sections and teleprompter release (D-38).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { useServer, as, setClock, is2xx, is4xx, expectStatus, unb64, TEST_TIMEOUT, T0, MIN, HOUR } from '../lib/api.mjs';
import { FIXTURES } from '../lib/paths.mjs';
import { pack, readTree } from '../lib/ustar.mjs';

const S = useServer();
const C = 'c1';
const GATE_IDS = ['G1-files', 'G2-readme', 'G3-diagnostic', 'G4-script-times', 'G5-links', 'G6-code-lang', 'G7-graded', 'G8-cards'];
const packageFiles = () => readTree(join(FIXTURES, 'package')).filter((f) => f.path !== 'FIXTURE.md');
const TAR = { 'content-type': 'application/x-tar' };

async function openSealed(keyB64, sealedB64) {
  const sealed = unb64(sealedB64);
  const key = await webcrypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['decrypt']);
  const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12) }, key, sealed.slice(12));
  return new TextDecoder().decode(plain);
}

test('AC-67 POST /api/packages runs the gate and returns its checks; a failing package is stored as draft and cannot be published', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const files = packageFiles();
  assert.ok(files.length > 0, 'fixture package present at acceptance/fixtures/package');
  const tr = await as(srv, 'tr1', ['trainer']);
  const good = expectStatus(await tr.req('/api/packages', { method: 'POST', body: pack(files), headers: TAR }), is2xx, 'upload the fixture package');
  assert.ok(good.json?.id, 'response has the package id');
  assert.ok(Array.isArray(good.json?.checks), 'response has the gate checks');
  for (const id of GATE_IDS) {
    const c = good.json.checks.find((x) => x.id === id);
    assert.ok(c, `gate check ${id} reported`);
    assert.equal(c.pass, true, `fixture package passes ${id}: ${c?.detail}`);
  }
  const pub = await tr.req(`/api/packages/${encodeURIComponent(good.json.id)}/publish`, { method: 'POST', body: {} });
  assert.ok(is2xx(pub.status), `a passing package can be published, got ${pub.status} ${pub.text.slice(0, 200)}`);

  const victim = files.find((f) => /(^|\/)day0\/quicklearn\.md$/.test(f.path)) ?? files.find((f) => /quicklearn\.md$/.test(f.path));
  assert.ok(victim, 'fixture has a quicklearn.md to remove');
  const bad = expectStatus(await tr.req('/api/packages', { method: 'POST', body: pack(files.filter((f) => f !== victim)), headers: TAR }), is2xx, 'upload a defective package (stored as draft)');
  const g1 = bad.json?.checks?.find((x) => x.id === 'G1-files');
  assert.equal(g1?.pass, false, 'missing quicklearn.md fails G1-files');
  assert.equal(bad.json?.status, 'draft', 'a failing package is stored as draft');
  const pub2 = await tr.req(`/api/packages/${encodeURIComponent(bad.json.id)}/publish`, { method: 'POST', body: {} });
  assert.ok(is4xx(pub2.status), `a draft with failing checks cannot be published, got ${pub2.status}`);
});

test('AC-68 learners get sealed sections before release; teleprompter releases a section key; ungraded sections release at their planned time; graded only by reaching them or release-all', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const learner = await as(srv, 'l1', ['learner']);
  const tr = await as(srv, 'tr1', ['trainer']);
  const day = async () => {
    const r = expectStatus(await learner.req(`/api/classes/${C}/days/0`), 200, 'learner reads day 0');
    assert.ok(Array.isArray(r.json?.sections), 'day response has sections[]');
    return { r, by: Object.fromEntries(r.json.sections.map((s) => [s.id, s])) };
  };
  const hasKey = (s) => typeof s?.key === 'string' && s.key.length > 0;

  await setClock(srv, T0 - 10 * MIN);
  let { r, by } = await day();
  for (const id of ['s-intro', 's-quiz', 's-lab', 's-exam']) {
    assert.ok(by[id], `section ${id} is listed`);
    assert.ok(typeof by[id].sealed === 'string' && by[id].sealed.length > 0, `${id} is delivered sealed`);
    assert.ok(!hasKey(by[id]), `${id} has no key before release`);
  }
  assert.ok(!r.text.includes('PLAINTEXT-MARKER'), 'no section plaintext is delivered before release');

  expectStatus(await tr.req(`/api/classes/${C}/teleprompter`, { method: 'POST', body: { sectionId: 's-quiz' } }), is2xx, 'trainer reaches s-quiz');
  ({ by } = await day());
  assert.ok(hasKey(by['s-quiz']), 'reaching a graded section releases its key');
  assert.match(await openSealed(by['s-quiz'].key, by['s-quiz'].sealed), /PLAINTEXT-MARKER-s-quiz/, 'the released key opens the sealed section (AES-GCM, IV prefixed)');
  assert.ok(!hasKey(by['s-lab']) && !hasKey(by['s-exam']), 'other sections stay sealed');

  await setClock(srv, T0 + 1200 * 1000 + 1000); // s-lab planned at start + 600 + 600 s
  ({ by } = await day());
  assert.ok(hasKey(by['s-intro']), 'ungraded s-intro released by time');
  assert.ok(hasKey(by['s-lab']), 'ungraded s-lab released at its planned time');
  assert.match(await openSealed(by['s-lab'].key, by['s-lab'].sealed), /PLAINTEXT-MARKER-s-lab/);
  await setClock(srv, T0 + 10 * HOUR);
  ({ by } = await day());
  assert.ok(!hasKey(by['s-exam']), 'a graded section is never released by time alone');

  expectStatus(await tr.req(`/api/classes/${C}/teleprompter`, { method: 'POST', body: { releaseAll: true } }), is2xx, 'trainer taps release all');
  ({ by } = await day());
  assert.ok(hasKey(by['s-exam']), 'release-all releases the graded section');
  assert.match(await openSealed(by['s-exam'].key, by['s-exam'].sealed), /PLAINTEXT-MARKER-s-exam/);
});
