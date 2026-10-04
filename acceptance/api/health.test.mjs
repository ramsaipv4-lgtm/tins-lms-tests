// SPEC §5.1: AC-60 health, AC-61 first start (org, admin invite, hub CA fingerprint).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../lib/server.mjs';
import { useServer, as, client, TEST_TIMEOUT } from '../lib/api.mjs';
import { scanText, formatFinding, plantedIn, PLANTED_ENV } from '../lib/secrets.mjs';

const S = useServer({ seed: null });
const fpHex = (j) => {
  const s = JSON.stringify(j ?? '').replace(/[:\s]/g, '');
  const m = s.match(/[0-9a-fA-F]{40,}/); return m ? m[0].toLowerCase() : null;
};

test('AC-60 GET /api/health returns 200 {ok:true, profile, schema, version} and no secrets', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const r = await client(srv.url).req('/api/health');
  assert.equal(r.status, 200, `health status; body: ${r.text.slice(0, 300)}`);
  assert.ok(r.json, 'health body is JSON');
  assert.equal(r.json.ok, true);
  assert.equal(r.json.profile, 'hub');
  assert.ok(Number.isInteger(r.json.schema), 'schema is an integer (D-23)');
  assert.ok(typeof r.json.version === 'string' && r.json.version.length > 0, 'version is a non-empty string');
  const findings = scanText('health', r.text);
  assert.deepEqual(findings.map(formatFinding), [], 'health body matches no secret pattern');
  assert.deepEqual(plantedIn(r.text), [], 'health body holds no planted secret');
  const invite = srv.stdout().match(/ADMIN_INVITE (\S+)/);
  if (invite) assert.ok(!r.text.includes(invite[1]), 'health body does not include the admin invite code');
});

test('AC-61 first start prints ADMIN_INVITE once, creates a hub CA whose fingerprint is served, and does not repeat on restart', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  const lines = srv.stdout().split(/\r?\n/).filter((l) => /^ADMIN_INVITE \S+/.test(l));
  assert.equal(lines.length, 1, `exactly one "ADMIN_INVITE <code>" line on first start; stdout:\n${srv.stdout().slice(0, 1000)}`);
  const admin = await as(srv, 'admin1', ['admin']);
  const f1 = await admin.req('/api/pairing/fingerprint');
  assert.equal(f1.status, 200, `fingerprint status; body: ${f1.text.slice(0, 300)}`);
  const fp = fpHex(f1.json ?? f1.text);
  assert.ok(fp, `fingerprint response holds a hex certificate fingerprint; got: ${f1.text.slice(0, 200)}`);

  // Restart on the same data folder: no new invite, same CA.
  await srv.stop();
  const again = await start({ env: { ...PLANTED_ENV, LMS_DATA_DIR: srv.dataDir } });
  try {
    assert.ok(!/ADMIN_INVITE /.test(again.stdout()), 'a second start on the same data does not print a new ADMIN_INVITE');
    const a2 = await as(again, 'admin1', ['admin']);
    const f2 = await a2.req('/api/pairing/fingerprint');
    assert.equal(f2.status, 200);
    assert.equal(fpHex(f2.json ?? f2.text), fp, 'the certificate authority is kept across restarts');
  } finally {
    await again.stop();
    assert.deepEqual(plantedIn(again.stdout()), [], 'AC-120: restarted server log holds no planted secret');
  }
});
