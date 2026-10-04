// SPEC §5.6: AC-69 CouchDB replication on /db/*, AC-70 core-merged conflicts, AC-71 schema refusal.
// PouchDB and the memory adapter come from the app's node_modules (SPEC D-6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { useServer, as, client, is4xx, expectStatus, TEST_TIMEOUT, T0 } from '../lib/api.mjs';
import { localDb, remoteDb, replicate } from '../lib/pouch.mjs';

const S = useServer();
const C = 'c1';
const SCHEMA_HEADER = 'x-lms-schema';
let hubSchema;
async function schema(srv) {
  if (hubSchema == null) hubSchema = expectStatus(await client(srv.url).req('/api/health'), 200, 'health').json.schema;
  return hubSchema;
}
const docsOf = async (db) => (await db.allDocs({ include_docs: true })).rows.map((r) => ({ id: r.id, rev: r.value.rev }));

test('AC-69 /db/class-<id> replicates both ways with a session; a learner gets 403 on another learner\'s personal database', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const sch = await schema(srv);
  const l1 = await as(srv, 'l1', ['learner']);
  const remote = remoteDb(`${srv.url}/db/class-${C}`, l1.cookie);
  const local = localDb('ac69');
  await replicate(remote, local);
  const cls = await local.get('class:c1');
  assert.equal(cls.type, 'class', 'pulled the seeded class document');
  const doubt = { _id: 'doubt:ac69', type: 'doubt', id: 'doubt:ac69', schema: sch, updatedAt: T0, updatedBy: 'l1', personId: 'l1', text: 'Synthetic doubt for AC-69', votes: [], answered: false };
  await local.put(doubt);
  const res = await replicate(local, remote);
  assert.equal(res.doc_write_failures ?? 0, 0, 'push had no write failures');
  const tr = await as(srv, 'tr1', ['trainer']);
  const seen = await tr.req(`/db/class-${C}/${encodeURIComponent('doubt:ac69')}`);
  assert.equal(seen.status, 200, 'the pushed document is on the hub');
  assert.equal(seen.json.text, doubt.text);

  const own = await l1.req('/db/person-l1');
  assert.equal(own.status, 200, `control: a learner can open their own personal database, got ${own.status}`);
  const other = await l1.req('/db/person-l2');
  assert.equal(other.status, 403, `another learner's personal database is 403, got ${other.status}`);
  const otherDocs = await l1.req('/db/person-l2/_all_docs');
  assert.equal(otherDocs.status, 403, '..._all_docs of it is 403 too');
  const anon = await client(srv.url).req(`/db/class-${C}`);
  assert.equal(anon.status, 401, 'no session: 401 on the class database');
});

test('AC-70 two offline edits to one ticket end, after sync, as the core-merged revision on both clients with no conflicts left', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const a = await as(srv, 'l1', ['learner']);
  const b = await as(srv, 'l2', ['learner']);
  const ra = remoteDb(`${srv.url}/db/class-${C}`, a.cookie);
  const rb = remoteDb(`${srv.url}/db/class-${C}`, b.cookie);
  const A = localDb('ac70a'); const B = localDb('ac70b');
  await replicate(ra, A); await replicate(rb, B);
  const ta = await A.get('ticket:t1'); const tb = await B.get('ticket:t1');
  // Offline edits: A moves to doing and renames later in time; B moves to done earlier in time.
  await A.put({ ...ta, status: 'doing', title: 'Renamed by A (latest)', updatedAt: T0 + 3000, updatedBy: 'l1' });
  await B.put({ ...tb, status: 'done', updatedAt: T0 + 2000, updatedBy: 'l2' });
  await replicate(A, ra); await replicate(B, rb);

  const tr = await as(srv, 'tr1', ['trainer']);
  let last;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    await replicate(ra, A); await replicate(rb, B);
    const hub = await tr.req(`/db/class-${C}/${encodeURIComponent('ticket:t1')}?conflicts=true`);
    const da = await A.get('ticket:t1', { conflicts: true }); const db = await B.get('ticket:t1', { conflicts: true });
    last = { hub: hub.json, da, db };
    if (hub.json && !hub.json._conflicts?.length && !da._conflicts?.length && !db._conflicts?.length && da._rev === hub.json._rev && db._rev === hub.json._rev) break;
    await sleep(500);
  }
  assert.ok(!last.hub?._conflicts?.length, `no conflicts remain on the hub after the merge pass: ${JSON.stringify(last.hub?._conflicts)}`);
  assert.ok(!last.da._conflicts?.length && !last.db._conflicts?.length, 'no conflicts remain on either client');
  assert.equal(last.da._rev, last.hub._rev, 'client A holds the hub revision');
  assert.equal(last.db._rev, last.hub._rev, 'client B holds the hub revision');
  assert.equal(last.hub.status, 'done', 'status takes the most advanced value (§4.13)');
  assert.equal(last.hub.title, 'Renamed by A (latest)', 'other fields are latest-wins by updatedAt (§4.13), not CouchDB\'s winner');
  assert.deepEqual({ ...last.da, _conflicts: undefined }, { ...last.db, _conflicts: undefined }, 'both clients end with the same document');
});

test('AC-71 a client 3 schema versions behind is refused with update-app and its local data is untouched', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const sch = await schema(srv);
  const old = sch - 3;
  const l1 = await as(srv, 'l1', ['learner']);
  const direct = await l1.req(`/db/class-${C}/_changes`, { headers: { [SCHEMA_HEADER]: String(old) } });
  assert.ok(is4xx(direct.status), `an old client's replication request is refused with 4xx, got ${direct.status}`);
  assert.match(direct.text, /update-app/, 'the refusal says update-app');
  const ok = await l1.req(`/db/class-${C}/_changes`, { headers: { [SCHEMA_HEADER]: String(sch) } });
  assert.equal(ok.status, 200, 'control: the same request with the hub schema is accepted');

  const local = localDb('ac71');
  await local.put({ _id: 'doubt:ac71', type: 'doubt', id: 'doubt:ac71', schema: old, updatedAt: T0, updatedBy: 'l1', text: 'old client doubt', votes: [], answered: false });
  await local.put({ _id: 'exitTicket:ac71', type: 'exitTicket', id: 'exitTicket:ac71', schema: old, updatedAt: T0, updatedBy: 'l1', personId: 'l1', dayIndex: 0, choiceIds: ['a'] });
  const before = await docsOf(local);
  const remote = remoteDb(`${srv.url}/db/class-${C}`, l1.cookie, { [SCHEMA_HEADER]: String(old) });
  await assert.rejects(replicate(local, remote, 15000), 'push from an old client fails');
  await assert.rejects(replicate(remote, local, 15000), 'pull to an old client fails');
  assert.deepEqual(await docsOf(local), before, 'local data is untouched (same ids and revisions)');
  const tr = await as(srv, 'tr1', ['trainer']);
  assert.equal((await tr.req(`/db/class-${C}/${encodeURIComponent('doubt:ac71')}`)).status, 404, 'nothing from the old client reached the hub');
});
