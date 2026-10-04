// SPEC §5.4: AC-66 rotating attendance code, verified marks, printed fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useServer, as, setClock, deepFind, is2xx, is4xx, expectStatus, TEST_TIMEOUT, T0, DAY } from '../lib/api.mjs';

const S = useServer();
const C = 'c1';
const DAY1 = T0 + DAY; // 2026-11-03 09:30 IST, class day 1, minute boundary

async function attendanceDocs(srv) {
  const tr = await as(srv, 'tr1', ['trainer']);
  const r = expectStatus(await tr.req(`/db/class-${C}/_all_docs?include_docs=true`), 200, 'trainer reads class db');
  return r.json.rows.map((x) => x.doc).filter((d) => d && d.type === 'attendance' && d.dayIndex === 1);
}

test('AC-66 the trainer gets the rotating code and seconds left; the code marks present+verified; a code two periods old is rejected; the printed fallback marks verified:false', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  await setClock(srv, DAY1 + 5000);
  const tr = await as(srv, 'tr1', ['trainer']);
  const r = expectStatus(await tr.req(`/api/classes/${C}/attendance-code`), 200, 'GET attendance-code');
  const code = deepFind(r.json, (v) => typeof v === 'string' && /^\d{6}$/.test(v));
  assert.ok(code, `response holds a 6-digit code: ${r.text.slice(0, 200)}`);
  const left = deepFind(r.json, (v, k) => typeof v === 'number' && /sec|left|remain/i.test(k));
  assert.ok(typeof left === 'number' && left > 0 && left <= 60, `seconds left is in (0, 60] for the default 60 s period: ${r.text.slice(0, 200)}`);
  assert.equal(left, 55, 'seconds left = 55 at 5 s into the period');

  const l1 = await as(srv, 'l1', ['learner']);
  const m = await l1.req(`/api/classes/${C}/attendance`, { method: 'POST', body: { code } });
  assert.ok(is2xx(m.status), `the current code marks the learner present, got ${m.status} ${m.text.slice(0, 200)}`);
  let docs = await attendanceDocs(srv);
  const a1 = docs.find((d) => d.personId === 'l1');
  assert.ok(a1, 'an attendance document exists for l1 on day 1');
  assert.equal(a1.verified, true);
  assert.equal(a1.method, 'rotating');

  // Same code two periods later is rejected.
  await setClock(srv, DAY1 + 2 * 60_000 + 5000);
  const l2 = await as(srv, 'l2', ['learner']);
  const old = await l2.req(`/api/classes/${C}/attendance`, { method: 'POST', body: { code } });
  assert.ok(is4xx(old.status), `a code two periods old is rejected, got ${old.status}`);
  docs = await attendanceDocs(srv);
  assert.ok(!docs.some((d) => d.personId === 'l2'), 'no attendance was recorded for the rejected code');

  // Printed fallback.
  const pr = expectStatus(await tr.req(`/api/classes/${C}/printed-code?day=1`), 200, 'trainer gets the printed fallback code');
  assert.ok(typeof pr.json?.code === 'string', `printed code response has code: ${pr.text.slice(0, 200)}`);
  const pm = await l2.req(`/api/classes/${C}/attendance`, { method: 'POST', body: { code: pr.json.code } });
  assert.ok(is2xx(pm.status), `printed code is accepted, got ${pm.status} ${pm.text.slice(0, 200)}`);
  docs = await attendanceDocs(srv);
  const a2 = docs.find((d) => d.personId === 'l2');
  assert.ok(a2, 'attendance recorded for l2');
  assert.equal(a2.verified, false, 'printed fallback marks verified: false');
  assert.equal(a2.method, 'printed');
});
