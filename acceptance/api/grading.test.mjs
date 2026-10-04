// SPEC §5.7: AC-72 attempts, grades as ledger entries, corrections; AC-73 appeals with an evidence pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useServer, as, setClock, deepFind, is2xx, is4xx, expectStatus, loadCore, TEST_TIMEOUT, T0, MIN, DAY } from '../lib/api.mjs';

const S = useServer();
const C = 'c1';
const SALT = 'salt-test-c1';
const SUMMARY = /^AI (off|allowed; used \d+ times|explain-only; used \d+ times)$/;
const has = (v, x) => JSON.stringify(v) === JSON.stringify(x) || (v && typeof v === 'object' && Object.values(v).some((y) => has(y, x)));

async function submit(srv, personId, itemId) {
  const l = await as(srv, personId, ['learner']);
  const r = expectStatus(await l.req(`/api/classes/${C}/attempts`, { method: 'POST', body: {
    itemId, mode: 'live', answers: { q1: 'b', q2: 'a' },
    // No hub-signed times (offline) and a device clock 10 minutes off the monotonic duration (§4.26).
    timing: { hubStart: null, hubEnd: null, monotonicMs: 10 * MIN, deviceStart: T0, deviceEnd: T0 + 20 * MIN },
    aiUsage: [{ at: T0 + MIN, toolKind: 'chat' }],
  } }), is2xx, `${personId} submits an attempt`);
  assert.ok(r.json?.id, `attempt response has an id: ${r.text.slice(0, 200)}`);
  return { learner: l, id: r.json.id };
}
async function classDocs(srv) {
  const tr = await as(srv, 'tr1', ['trainer']);
  return expectStatus(await tr.req(`/db/class-${C}/_all_docs?include_docs=true`), 200, 'class db').json.rows.map((r) => r.doc).filter(Boolean);
}

test('AC-72 an attempt stores seed, mode, timing flags and AI-usage summary; the grade is a ledger entry; a correction keeps the original', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  await setClock(srv, T0 + 30 * MIN);
  const { id } = await submit(srv, 'l1', 'quiz-ac72');
  const attempt = (await classDocs(srv)).find((d) => d.type === 'attempt' && d.itemId === 'quiz-ac72');
  assert.ok(attempt, 'the attempt is stored as an attempt document in the class database');
  assert.equal(attempt.personId, 'l1');
  assert.equal(attempt.mode, 'live');
  assert.ok(typeof attempt.seed === 'string' && attempt.seed.length > 0, 'seed stored');
  let core = null; try { core = await loadCore(); } catch {}
  if (core?.seedFor) assert.equal(attempt.seed, await core.seedFor(SALT, 'quiz-ac72'), 'seed = seedFor(class seedSalt, itemId) (§4.1)');
  assert.ok(Array.isArray(attempt.timing?.flags), 'timing.flags stored');
  assert.ok(attempt.timing.flags.includes('offline-attempt'), 'no hub times -> offline-attempt');
  assert.ok(attempt.timing.flags.includes('clock-skew'), 'device clock 10 min off -> clock-skew');
  assert.ok(deepFind(attempt, (v) => typeof v === 'string' && SUMMARY.test(v)), 'AI-usage summary string stored (§4.12)');

  const tr = await as(srv, 'tr1', ['trainer']);
  expectStatus(await tr.req(`/api/classes/${C}/attempts/${encodeURIComponent(id)}/grade`, { method: 'POST', body: { score: 6 } }), is2xx, 'trainer signs off score 6');
  expectStatus(await tr.req(`/api/classes/${C}/attempts/${encodeURIComponent(id)}/grade`, { method: 'POST', body: { score: 7, reason: 'recounted question 2' } }), is2xx, 'trainer corrects to 7');
  const ledgers = (await classDocs(srv)).filter((d) => d.type === 'ledger' && Array.isArray(d.entries));
  const ledger = ledgers.find((l) => l.entries.some((e) => has(e.value, 6)) && l.entries.some((e) => has(e.value, 7)));
  assert.ok(ledger, `a ledger document holds both grade entries; ledgers: ${JSON.stringify(ledgers).slice(0, 400)}`);
  const orig = ledger.entries.find((e) => has(e.value, 6));
  const corr = ledger.entries.find((e) => has(e.value, 7));
  assert.equal(corr.corrects, orig.seq, 'the correction names the original seq (P-10)');
  assert.ok(corr.seq > orig.seq, 'the correction is a later entry');
  assert.ok(typeof orig.hash === 'string' && typeof corr.prevHash === 'string', 'entries are hash-chained');
  if (core?.verifyLedger) assert.equal((await core.verifyLedger(ledger.entries)).ok, true, 'verifyLedger is ok on the stored ledger');
  if (core?.currentValue) assert.ok(has(core.currentValue(ledger.entries, corr.subject), 7), 'currentValue is the corrected grade');
});

test('AC-73 a learner opens an appeal within 7 days; the trainer inbox shows it with the evidence pack; after 7 days the window is closed', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const t1 = T0 + 40 * MIN;
  await setClock(srv, t1);
  const { learner, id } = await submit(srv, 'l2', 'quiz-ac73');
  const tr = await as(srv, 'tr1', ['trainer']);
  expectStatus(await tr.req(`/api/classes/${C}/attempts/${encodeURIComponent(id)}/grade`, { method: 'POST', body: { score: 4 } }), is2xx, 'grade published');
  await setClock(srv, t1 + 6 * DAY);
  const ap = await learner.req(`/api/classes/${C}/appeals`, { method: 'POST', body: { attemptId: id, reason: 'Question 2 accepts both answers.' } });
  assert.ok(is2xx(ap.status), `appeal within 7 days opens, got ${ap.status} ${ap.text.slice(0, 200)}`);
  const inbox = expectStatus(await tr.req(`/api/classes/${C}/appeals`), 200, 'trainer inbox');
  const list = Array.isArray(inbox.json) ? inbox.json : inbox.json?.appeals;
  assert.ok(Array.isArray(list), 'inbox is a list (or { appeals: [] })');
  const item = list.find((a) => a.attemptId === id);
  assert.ok(item, 'the appeal appears in the trainer inbox');
  const ev = item.evidence;
  assert.ok(ev && typeof ev === 'object', 'appeal carries an evidence pack');
  const attempt = (await classDocs(srv)).find((d) => d.type === 'attempt' && d.itemId === 'quiz-ac73');
  assert.equal(ev.seed, attempt?.seed, 'evidence: seed');
  assert.equal(ev.mode, 'live', 'evidence: mode');
  assert.ok(Array.isArray(ev.events), 'evidence: events');
  assert.ok(Array.isArray(ev.rubricRows), 'evidence: rubric rows');
  assert.ok(Number.isInteger(ev.unreadConfirmations), 'evidence: unread-confirmation count');

  // A second attempt appealed after 7 days.
  const t2 = t1 + 6 * DAY;
  const second = await submit(srv, 'l1', 'quiz-ac73-late');
  expectStatus(await tr.req(`/api/classes/${C}/attempts/${encodeURIComponent(second.id)}/grade`, { method: 'POST', body: { score: 3 } }), is2xx, 'second grade published');
  await setClock(srv, t2 + 7 * DAY + 1000);
  const late = await second.learner.req(`/api/classes/${C}/appeals`, { method: 'POST', body: { attemptId: second.id, reason: 'late' } });
  assert.ok(is4xx(late.status), `appeal after 7 days is refused, got ${late.status}`);
  assert.match(late.text, /window-closed/, 'refusal reason is window-closed (§4.11)');
});
