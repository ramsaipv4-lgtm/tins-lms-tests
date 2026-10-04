// SPEC §8: AC-120 no planted secret reaches the server log; AC-121 coachEntry documents are ciphertext only.
// (Every API test file also checks its own server log for planted secrets in its after() hook.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { useServer, as, client, is2xx, is4xx, expectStatus, TEST_TIMEOUT, T0 } from '../lib/api.mjs';
import { PLANTED, plantedIn, scanText, formatFinding } from '../lib/secrets.mjs';

const S = useServer();
const C = 'c1';
const MARK = 'COACH-PLAINTEXT-MARKER-4d2c';

function grepTree(dir, needle) {
  const hits = []; const n = Buffer.from(needle);
  const walk = (d) => { for (const x of readdirSync(d)) { const p = join(d, x); const s = statSync(p); if (s.isDirectory()) walk(p); else if (s.size < 64 * 1024 * 1024 && readFileSync(p).includes(n)) hits.push(p); } };
  walk(dir); return hits;
}

test('AC-120 no server log line contains a planted secret (env secrets, bearer/basic credentials, session cookies, passphrases, private keys)', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const cookies = [];
  for (const [p, r] of [['admin1', ['admin']], ['tr1', ['trainer']], ['l1', ['learner']]]) { const c = await as(srv, p, r); cookies.push(...c.cookie.split('; ').map((x) => x.slice(x.indexOf('=') + 1)).filter((v) => v.length >= 8)); }
  const anon = client(srv.url);
  const probes = [
    ['GET', '/api/me', { authorization: `Bearer ${PLANTED.bearer}` }],
    ['GET', '/api/me', { cookie: `session=${PLANTED.bearer}` }],
    ['GET', `/api/me?token=${PLANTED.githubToken}`, {}],
    ['GET', `/db/class-${C}`, { authorization: 'Basic ' + Buffer.from(`admin:${PLANTED.passphrase}`).toString('base64') }],
    ['GET', '/api/health', { 'x-api-key': PLANTED.githubToken }],
  ];
  for (const [m, p, h] of probes) await anon.req(p, { method: m, headers: h });
  await anon.req('/api/join', { method: 'POST', body: { code: 'NOPE', passphrase: PLANTED.passphrase, token: PLANTED.githubToken } });
  await anon.req('/api/join', { method: 'POST', body: `{"passphrase":"${PLANTED.passphrase}", broken json`, headers: { 'content-type': 'application/json' } });
  await anon.req('/api/pairing/claim', { method: 'POST', body: { code: PLANTED.bearer, deviceId: 'dev-x' } });
  const l1 = await as(srv, 'l1', ['learner']);
  cookies.push(l1.cookie.slice(l1.cookie.indexOf('=') + 1));
  const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', privateKey);
  await l1.req('/api/me/device-key', { method: 'POST', body: { deviceId: 'dev-wrong', publicJwk: priv } }); // a client mistakenly sends a private JWK
  await sleep(500);
  const out = srv.stdout();
  const extra = { privateJwkD: priv.d, ...Object.fromEntries(cookies.map((v, i) => [`sessionCookie${i}`, v])) };
  assert.deepEqual(plantedIn(out, extra), [], 'no planted secret or session cookie in the server log');
  assert.deepEqual(scanText('server-log', out).map(formatFinding), [], 'no tins-kit secret pattern in the server log');
});

test('AC-121 coachEntry documents in the personal database are ciphertext only (plaintext is refused; raw storage has no plaintext)', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const l1 = await as(srv, 'l1', ['learner']);
  const base = { type: 'coachEntry', schema: 1, updatedAt: T0, updatedBy: 'l1' };
  const plain = { _id: 'coachEntry:plain-1', id: 'coachEntry:plain-1', ...base, kind: 'food', values: { note: MARK, kcal: 1850 }, source: 'manual', confirmed: true };
  const r = await l1.req(`/db/person-l1/${encodeURIComponent(plain._id)}`, { method: 'PUT', body: plain });
  assert.ok(is4xx(r.status), `a plaintext coachEntry is refused by the hub, got ${r.status} ${r.text.slice(0, 200)}`);
  const bulk = await l1.req('/db/person-l1/_bulk_docs', { method: 'POST', body: { docs: [{ ...plain, _id: 'coachEntry:plain-2', id: 'coachEntry:plain-2' }] } });
  const bulkOk = is4xx(bulk.status) || (Array.isArray(bulk.json) && bulk.json.every((x) => x.error));
  assert.ok(bulkOk, `a plaintext coachEntry via _bulk_docs is refused too, got ${bulk.status} ${bulk.text.slice(0, 200)}`);
  const sealed = { _id: 'coachEntry:sealed-1', id: 'coachEntry:sealed-1', ...base, enc: { iv: 'AAAAAAAAAAAAAAAA', ct: 'q83vEjRWeJA0a2V5c2FyZW5vdGhlcmU=' } };
  const ok = await l1.req(`/db/person-l1/${encodeURIComponent(sealed._id)}`, { method: 'PUT', body: sealed });
  assert.ok(is2xx(ok.status), `an encrypted coachEntry is stored, got ${ok.status} ${ok.text.slice(0, 200)}`);

  const raw = expectStatus(await l1.req('/db/person-l1/_all_docs?include_docs=true'), 200, 'read the personal database');
  const coach = raw.json.rows.map((x) => x.doc).filter((d) => d?.type === 'coachEntry');
  assert.ok(coach.length >= 1, 'the encrypted entry is there');
  for (const d of coach) for (const f of ['values', 'kind', 'source']) assert.ok(!(f in d), `${d._id} has no plaintext field ${f}`);
  assert.ok(!raw.text.includes(MARK), 'no plaintext marker in the personal database');
  await sleep(300);
  assert.deepEqual(grepTree(srv.dataDir, MARK), [], 'no plaintext marker anywhere in the server data folder');
});
