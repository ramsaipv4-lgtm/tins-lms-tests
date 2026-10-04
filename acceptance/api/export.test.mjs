// SPEC §5.8: AC-74 export tar, AC-75 import round trip, AC-76 signed class packages and submissions, AC-77 no secrets in exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { start } from '../lib/server.mjs';
import { useServer, as, setClock, is2xx, is4xx, expectStatus, loadCore, TEST_TIMEOUT, T0, MIN } from '../lib/api.mjs';
import { unpack } from '../lib/ustar.mjs';
import { scanText, formatFinding, plantedIn, PLANTED_ENV } from '../lib/secrets.mjs';

const S = useServer();
const C = 'c1';
const dec = (b) => new TextDecoder().decode(b);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const cookieValues = [];
const remember = (c) => { for (const p of c.cookie.split('; ')) { const v = p.slice(p.indexOf('=') + 1); if (v.length >= 8) cookieValues.push(v); } return c; };
let state = null; // { adminTar, files, meFiles }

async function prepare(srv) {
  if (state) return state;
  await setClock(srv, T0 + 20 * MIN);
  const l1 = remember(await as(srv, 'l1', ['learner']));
  const tr = remember(await as(srv, 'tr1', ['trainer']));
  const a = expectStatus(await l1.req(`/api/classes/${C}/attempts`, { method: 'POST', body: { itemId: 'quiz-export', mode: 'live', answers: { q1: 'a' }, timing: { hubStart: null, hubEnd: null, monotonicMs: 60000, deviceStart: T0, deviceEnd: T0 + 60000 }, aiUsage: [] } }), is2xx, 'attempt for export data');
  expectStatus(await tr.req(`/api/classes/${C}/attempts/${encodeURIComponent(a.json.id)}/grade`, { method: 'POST', body: { score: 7 } }), is2xx, 'grade for export data');
  const admin = remember(await as(srv, 'admin1', ['admin']));
  const ex = expectStatus(await admin.req('/api/export'), 200, 'GET /api/export');
  const files = unpack(ex.bytes).filter((f) => f.type === 'file');
  const all = unpack(ex.bytes);
  const me = expectStatus(await l1.req('/api/me/export'), 200, 'GET /api/me/export');
  state = { adminTar: ex.bytes, files, all, meFiles: unpack(me.bytes).filter((f) => f.type === 'file') };
  return state;
}
const byName = (files, re) => files.find((f) => re.test(f.path));
const csvRows = (f) => dec(f.bytes).split(/\r?\n/).filter(Boolean).sort();

test('AC-74 GET /api/export returns a tar with manifest, CSVs, Markdown, JSON ledgers/events and board files that verifyManifest accepts; /api/me/export holds only the caller\'s data', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const { files, all, meFiles } = await prepare(srv);
  assert.ok(files.length > 0, 'export is a non-empty tar');
  const mf = byName(files, /(^|\/)manifest\.json$/);
  assert.ok(mf, 'manifest.json present');
  for (const [label, re] of [['roster CSV', /roster[^/]*\.csv$/i], ['attendance CSV', /attendance[^/]*\.csv$/i], ['grades CSV', /grade[^/]*\.csv$/i], ['Markdown content', /\.md$/i], ['JSON ledgers', /ledger[^/]*\.json$|ledgers?\/[^/]+\.json$/i], ['JSON events', /event[^/]*\.json$|events?\/[^/]+\.json$/i]]) {
    assert.ok(byName(files, re), `${label} present; paths: ${files.map((f) => f.path).join(', ').slice(0, 500)}`);
  }
  assert.ok(all.some((f) => /board/i.test(f.path)), 'board files (or the board folder) present');
  assert.match(dec(byName(files, /roster[^/]*\.csv$/i).bytes), /Asha Testlearner/, 'roster lists the seeded learner');

  const manifest = JSON.parse(dec(mf.bytes));
  assert.equal(manifest.version, 1);
  const paths = manifest.files.map((f) => f.path);
  assert.deepEqual(paths, [...paths].sort(), 'manifest paths are sorted');
  const prefix = mf.path.slice(0, mf.path.length - 'manifest.json'.length);
  const content = files.filter((f) => f !== mf).map((f) => ({ path: f.path.slice(prefix.length), bytes: f.bytes }));
  const have = new Map(content.map((f) => [f.path, f.bytes]));
  const missing = paths.filter((p) => !have.has(p));
  const extra = [...have.keys()].filter((p) => !paths.includes(p));
  const changed = manifest.files.filter((f) => have.has(f.path) && (sha(have.get(f.path)) !== f.sha256 || have.get(f.path).length !== f.size)).map((f) => f.path);
  assert.deepEqual({ missing, extra, changed }, { missing: [], extra: [], changed: [] }, 'manifest matches the files (§4.24)');
  let core = null; try { core = await loadCore(); } catch {}
  if (core?.verifyManifest) assert.deepEqual(await core.verifyManifest(content, manifest), { missing: [], extra: [], changed: [] }, 'core verifyManifest passes');

  assert.ok(meFiles.length > 0, 'personal export is non-empty');
  const meText = meFiles.map((f) => dec(f.bytes)).join('\n');
  assert.match(meText, /Asha Testlearner|\bl1\b/, 'personal export holds the caller\'s data');
  for (const other of ['Bilal Testlearner', 'Mira Testminor', 'Chen Testlearner', 'Tara Testtrainer']) assert.ok(!meText.includes(other), `personal export does not include ${other}`);
});

test('AC-75 POST /api/import of the export into an empty server reproduces roster, attendance and grades', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const { adminTar, files } = await prepare(srv);
  const fresh = await start({ env: PLANTED_ENV });
  try {
    const admin = await as(fresh, 'admin1', ['admin']);
    const imp = await admin.req('/api/import', { method: 'POST', body: adminTar, headers: { 'content-type': 'application/x-tar' } });
    assert.ok(is2xx(imp.status), `import succeeds, got ${imp.status} ${imp.text.slice(0, 300)}`);
    const again = unpack(expectStatus(await admin.req('/api/export'), 200, 'export from the new server').bytes).filter((f) => f.type === 'file');
    for (const re of [/roster[^/]*\.csv$/i, /attendance[^/]*\.csv$/i, /grade[^/]*\.csv$/i]) {
      const a = byName(files, re), b = byName(again, re);
      assert.ok(b, `re-export has ${re}`);
      assert.deepEqual(csvRows(b), csvRows(a), `${re} rows are identical after import`);
    }
  } finally {
    await fresh.stop();
    assert.deepEqual(plantedIn(fresh.stdout()), [], 'AC-120: second server log holds no planted secret');
  }
});

test('AC-76 the trainer gets a signed day package; a submission signed by an enrolled learner\'s device key is accepted; tampered or unknown-signer files are rejected', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const core = await loadCore();
  const tr = await as(srv, 'tr1', ['trainer']);
  const pkg = expectStatus(await tr.req(`/api/classes/${C}/package?day=0`), 200, 'GET class package day 0');
  assert.ok(pkg.bytes.length > 0, 'package is non-empty');
  const opened = await core.openPackage(pkg.bytes, []);
  assert.deepEqual(opened, { ok: false, reason: 'untrusted' }, 'the package is a signed container (§4.24) whose signer is simply not in an empty trust list');

  const enc = new TextEncoder();
  const archive = core.tarPack([{ path: 'submission/answer.md', bytes: enc.encode('# Answer\nSynthetic submission for AC-76.\n') }]);
  const register = async (personId, deviceId) => {
    const c = await as(srv, personId, ['learner']);
    const keys = await core.generateSigningKeys();
    expectStatus(await c.req('/api/me/device-key', { method: 'POST', body: { deviceId, publicJwk: keys.publicJwk } }), is2xx, `${personId} registers a device key`);
    return { c, keys };
  };
  const l1 = await register('l1', 'dev-l1-ac76');
  const good = await core.signPackage(archive, l1.keys.privateJwk);
  const ok = await l1.c.req(`/api/classes/${C}/files`, { method: 'POST', body: good, headers: { 'content-type': 'application/octet-stream' } });
  assert.ok(is2xx(ok.status), `signed submission accepted, got ${ok.status} ${ok.text.slice(0, 200)}`);

  const tampered = good.slice(); tampered[Math.floor(tampered.length / 2)] ^= 0xff;
  const bad = await l1.c.req(`/api/classes/${C}/files`, { method: 'POST', body: tampered, headers: { 'content-type': 'application/octet-stream' } });
  assert.ok(is4xx(bad.status), `tampered file rejected, got ${bad.status}`);

  const stranger = await core.generateSigningKeys();
  const unknown = await l1.c.req(`/api/classes/${C}/files`, { method: 'POST', body: await core.signPackage(archive, stranger.privateJwk), headers: { 'content-type': 'application/octet-stream' } });
  assert.ok(is4xx(unknown.status), `unknown signer rejected, got ${unknown.status}`);

  const l3 = await register('l3', 'dev-l3-ac76'); // l3 is not enrolled in c1
  const notEnrolled = await l3.c.req(`/api/classes/${C}/files`, { method: 'POST', body: await core.signPackage(archive, l3.keys.privateJwk), headers: { 'content-type': 'application/octet-stream' } });
  assert.ok(is4xx(notEnrolled.status), `a file signed by a non-enrolled person's key is rejected, got ${notEnrolled.status}`);
});

test('AC-77 export files never contain private keys, tokens, passphrases or session cookies (tins-kit secret patterns)', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const { files, meFiles } = await prepare(srv);
  const findings = [];
  const leaks = [];
  const extra = Object.fromEntries(cookieValues.map((v, i) => [`sessionCookie${i}`, v]));
  for (const [label, list] of [['export', files], ['me-export', meFiles]]) {
    for (const f of list) {
      const text = dec(f.bytes);
      findings.push(...scanText(`${label}:${f.path}`, text));
      for (const k of plantedIn(text, extra)) leaks.push(`${label}:${f.path}: ${k}`);
    }
  }
  assert.ok(cookieValues.length > 0, 'session cookie values were collected for the scan');
  assert.deepEqual(findings.map(formatFinding), [], 'no secret-pattern matches in exports');
  assert.deepEqual(leaks, [], 'no planted secret or session cookie value in exports');
});
