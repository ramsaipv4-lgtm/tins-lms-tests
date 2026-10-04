// SPEC §5.2 + §8: AC-62 auth and roles, AC-63 join codes, AC-64 T&C and minors, AC-122 minor limits.
// Routes not fixed by SPEC are listed in acceptance/api/CONTRACT.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useServer, as, client, is2xx, is4xx, expectStatus, TEST_TIMEOUT, T0 } from '../lib/api.mjs';
import { pack } from '../lib/ustar.mjs';

const S = useServer();
const C = 'c1';
const encCoach = (id, person) => ({ _id: id, type: 'coachEntry', id, schema: 1, updatedAt: T0, updatedBy: person, enc: { iv: 'AAAAAAAAAAAAAAAA', ct: 'q83vEjRWeJA=' } });

async function newJoinCode(srv) {
  const tr = await as(srv, 'tr1', ['trainer']);
  const r = expectStatus(await tr.req(`/api/classes/${C}/join-codes`, { method: 'POST', body: {} }), is2xx, 'trainer creates a one-time class code');
  assert.ok(typeof r.json?.code === 'string' && r.json.code.length >= 4, `join-code response has a code: ${r.text.slice(0, 200)}`);
  return r.json.code;
}
async function tncVersion(srv) {
  const r = expectStatus(await client(srv.url).req('/api/join/tnc'), 200, 'GET /api/join/tnc (no session)');
  assert.ok(r.json?.version != null, 'T&C response has a version');
  return r.json.version;
}
async function enrolments(srv) {
  const tr = await as(srv, 'tr1', ['trainer']);
  const r = expectStatus(await tr.req(`/db/class-${C}/_all_docs?include_docs=true`), 200, 'trainer reads class db');
  return r.json.rows.map((x) => x.doc).filter((d) => d && d.type === 'enrolment');
}
async function attemptFor(srv, personId) {
  const l = await as(srv, personId, ['learner']);
  const r = expectStatus(await l.req(`/api/classes/${C}/attempts`, { method: 'POST', body: { itemId: 'quiz-day0', mode: 'live', answers: { q1: 'a' }, timing: { hubStart: null, hubEnd: null, monotonicMs: 60000, deviceStart: T0, deviceEnd: T0 + 60000 }, aiUsage: [] } }), is2xx, 'learner submits an attempt');
  assert.ok(r.json?.id, 'attempt response has an id');
  return r.json.id;
}

test('AC-62 /api/* needs a session except health and join; learners get 403 on trainer/admin routes; substitutes get 403 on grade sign-off and syllabus edits', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const anon = client(srv.url);
  const protectedRoutes = [
    ['GET', '/api/me'], ['GET', '/api/devices'], ['POST', '/api/pairing'], ['GET', '/api/pairing/fingerprint'],
    ['GET', `/api/classes/${C}/attendance-code`], ['POST', `/api/classes/${C}/attendance`], ['POST', `/api/classes/${C}/join-codes`],
    ['POST', '/api/packages'], ['POST', `/api/classes/${C}/teleprompter`], ['GET', `/api/classes/${C}/days/0`],
    ['POST', `/api/classes/${C}/attempts`], ['GET', `/api/classes/${C}/appeals`], ['GET', '/api/export'], ['GET', '/api/me/export'],
    ['POST', '/api/import'], ['GET', `/api/classes/${C}/package?day=0`], ['POST', `/api/classes/${C}/files`],
  ];
  for (const [m, p] of protectedRoutes) {
    const r = await anon.req(p, { method: m, body: m === 'GET' ? undefined : {} });
    assert.equal(r.status, 401, `${m} ${p} without a session must be 401, got ${r.status}`);
  }
  assert.equal((await anon.req('/api/health')).status, 200, 'health needs no session');
  const j = await anon.req('/api/join', { method: 'POST', body: {} });
  assert.notEqual(j.status, 401, 'join needs no session (an invalid body gives 400, not 401)');
  assert.equal(j.status, 400, 'invalid join body is a 400 validation error');
  assert.ok(j.json?.error && typeof j.json.error === 'object', 'validation error body is { error: { field: message } }');

  const learner = await as(srv, 'l1', ['learner']);
  const trainerOrAdmin = [
    ['POST', '/api/pairing', {}], ['GET', `/api/classes/${C}/attendance-code`], ['POST', `/api/classes/${C}/teleprompter`, { sectionId: 's-quiz' }],
    ['GET', `/api/classes/${C}/package?day=0`], ['POST', `/api/classes/${C}/join-codes`, {}], ['GET', `/api/classes/${C}/appeals`],
    ['GET', '/api/devices'], ['GET', '/api/export'], ['POST', '/api/import', new Uint8Array(1024)], ['POST', '/api/admin/tnc', { version: 'x', text: 'x' }],
    ['POST', '/api/packages', pack([])],
  ];
  for (const [m, p, body] of trainerOrAdmin) {
    const r = await learner.req(p, { method: m, body });
    assert.equal(r.status, 403, `learner ${m} ${p} must be 403, got ${r.status}`);
  }
  const attemptId = await attemptFor(srv, 'l2');
  const sub = await as(srv, 'sub1', ['substitute']);
  const g = await sub.req(`/api/classes/${C}/attempts/${attemptId}/grade`, { method: 'POST', body: { score: 5 } });
  assert.equal(g.status, 403, `substitute grade sign-off must be 403, got ${g.status}`);
  const pk = await sub.req('/api/packages', { method: 'POST', body: pack([]), headers: { 'content-type': 'application/x-tar' } });
  assert.equal(pk.status, 403, `substitute syllabus/package upload must be 403, got ${pk.status}`);
  const tr = await as(srv, 'tr1', ['trainer']);
  const tg = await tr.req(`/api/classes/${C}/attempts/${attemptId}/grade`, { method: 'POST', body: { score: 5 } });
  assert.ok(is2xx(tg.status), `the trainer can sign off the same grade (control), got ${tg.status} ${tg.text.slice(0, 200)}`);
});

test('AC-63 a one-time class code creates an enrolment, cannot be reused, and a second join with the same roll number warns already-enrolled', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const version = await tncVersion(srv);
  const before = (await enrolments(srv)).length;
  const code = await newJoinCode(srv);
  const body = { code, name: 'Dev Testjoiner', rollNumber: 'ROLL-TEST-0100', dob: '2001-01-01', tncVersion: version };
  const j1 = await client(srv.url).req('/api/join', { method: 'POST', body });
  assert.ok(is2xx(j1.status), `join with a valid code succeeds, got ${j1.status} ${j1.text.slice(0, 300)}`);
  const after1 = await enrolments(srv);
  assert.equal(after1.length, before + 1, 'exactly one enrolment was created');
  const created = after1.find((e) => !['l1', 'l2', 'm1'].includes(e.personId));
  assert.ok(created && created.status === 'active', 'the new enrolment is active');

  const reuse = await client(srv.url).req('/api/join', { method: 'POST', body: { ...body, rollNumber: 'ROLL-TEST-0101', name: 'Eve Testjoiner' } });
  assert.ok(is4xx(reuse.status), `reusing a one-time code fails with 4xx, got ${reuse.status}`);
  assert.equal((await enrolments(srv)).length, before + 1, 'reused code created nothing');

  const code2 = await newJoinCode(srv);
  const dup = await client(srv.url).req('/api/join', { method: 'POST', body: { ...body, code: code2 } });
  assert.match(dup.text, /already-enrolled/, `joining twice with the same roll number warns already-enrolled; got ${dup.status} ${dup.text.slice(0, 300)}`);
  assert.equal((await enrolments(srv)).length, before + 1, 'the duplicate join did not add a second enrolment');
});

test('AC-64 signup records the T&C version with a timestamp; a new version asks again; a date of birth under 18 creates a minor with Coach trackers off', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const v1 = await tncVersion(srv);
  const joiner = client(srv.url);
  expectStatus(await joiner.req('/api/join', { method: 'POST', body: { code: await newJoinCode(srv), name: 'Faye Testjoiner', rollNumber: 'ROLL-TEST-0200', dob: '1999-07-07', tncVersion: v1 } }), is2xx, 'adult join');
  assert.ok(joiner.cookie, 'join sets a session cookie');
  const me1 = expectStatus(await joiner.req('/api/me'), 200, 'GET /api/me after join');
  assert.equal(String(me1.json?.tnc?.version), String(v1), 'accepted T&C version is recorded');
  assert.ok(Number.isFinite(me1.json?.tnc?.acceptedAt) && me1.json.tnc.acceptedAt > 0, 'acceptance has a timestamp (ms)');
  assert.notEqual(me1.json?.tnc?.needsAcceptance, true, 'no new acceptance needed yet');
  assert.equal(me1.json?.minor, false, 'an adult is not a minor');

  const admin = await as(srv, 'admin1', ['admin']);
  expectStatus(await admin.req('/api/admin/tnc', { method: 'POST', body: { version: 'test-tnc-v2', text: 'Synthetic terms, version 2.' } }), is2xx, 'admin publishes a new T&C version');
  const me2 = expectStatus(await joiner.req('/api/me'), 200, 'GET /api/me after new T&C');
  assert.equal(me2.json?.tnc?.needsAcceptance, true, 'a new T&C version asks again');
  expectStatus(await joiner.req('/api/me/tnc', { method: 'POST', body: { version: 'test-tnc-v2' } }), is2xx, 'accept the new version');
  const me3 = await joiner.req('/api/me');
  assert.equal(me3.json?.tnc?.version, 'test-tnc-v2');
  assert.notEqual(me3.json?.tnc?.needsAcceptance, true);
  assert.ok(me3.json.tnc.acceptedAt >= me1.json.tnc.acceptedAt, 'new acceptance timestamp recorded');

  const minor = client(srv.url);
  expectStatus(await minor.req('/api/join', { method: 'POST', body: { code: await newJoinCode(srv), name: 'Gita Testminor', rollNumber: 'ROLL-TEST-0300', dob: '2012-03-03', tncVersion: 'test-tnc-v2' } }), is2xx, 'minor join');
  const mm = expectStatus(await minor.req('/api/me'), 200, 'GET /api/me (minor)');
  assert.equal(mm.json?.minor, true, 'date of birth under 18 (at the server clock) gives minor: true');
  assert.equal(mm.json?.coachTrackers, false, 'Coach trackers are off for a minor (D-33)');
});

test('AC-122 a minor cannot create Coach tracker entries and their integrity log keeps exam events only', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const m = await as(srv, 'm1', ['learner']);
  const put = await m.req(`/db/person-m1/${encodeURIComponent('coachEntry:minor-1')}`, { method: 'PUT', body: encCoach('coachEntry:minor-1', 'm1') });
  assert.equal(put.status, 403, `a minor's coachEntry write is refused with 403, got ${put.status} ${put.text.slice(0, 200)}`);
  const adult = await as(srv, 'l1', ['learner']);
  const ok = await adult.req(`/db/person-l1/${encodeURIComponent('coachEntry:adult-1')}`, { method: 'PUT', body: encCoach('coachEntry:adult-1', 'l1') });
  assert.ok(is2xx(ok.status), `control: an adult's encrypted coachEntry is accepted, got ${ok.status} ${ok.text.slice(0, 200)}`);

  for (const [who, cl] of [['m1', m], ['l1', adult]]) {
    for (const ev of [{ context: 'exam', kind: 'focus-lost', at: T0 + 1000 }, { context: 'practice', kind: 'focus-lost', at: T0 + 2000 }]) {
      const r = await cl.req(`/api/classes/${C}/integrity`, { method: 'POST', body: ev });
      assert.ok(is2xx(r.status), `${who} integrity event accepted (stored or dropped), got ${r.status}`);
    }
  }
  const tr = await as(srv, 'tr1', ['trainer']);
  const lm = expectStatus(await tr.req(`/api/classes/${C}/integrity?personId=m1`), 200, 'trainer reads minor integrity log');
  const la = expectStatus(await tr.req(`/api/classes/${C}/integrity?personId=l1`), 200, 'trainer reads adult integrity log');
  const ctx = (r) => (Array.isArray(r.json) ? r.json : r.json?.events ?? []).map((e) => e.context);
  assert.deepEqual(ctx(lm), ['exam'], 'the minor log keeps the exam event only');
  assert.deepEqual([...ctx(la)].sort(), ['exam', 'practice'], 'control: the adult log keeps both');
});
