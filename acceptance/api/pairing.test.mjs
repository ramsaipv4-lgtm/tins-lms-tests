// SPEC §5.3: AC-65 one-time pairing codes, devices list and revoke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useServer, as, client, setClock, is2xx, is4xx, expectStatus, TEST_TIMEOUT, T0, MIN } from '../lib/api.mjs';

const S = useServer();

test('AC-65 POST /api/pairing gives a 5-minute one-time code with a QR payload (hub id, address, fingerprint); claim once; devices list; DELETE revokes (401 after)', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  await setClock(srv, T0);
  const tr = await as(srv, 'tr1', ['trainer']);
  const fp = expectStatus(await tr.req('/api/pairing/fingerprint'), 200, 'fingerprint');
  const fpHex = JSON.stringify(fp.json ?? fp.text).replace(/[:\s"]/g, '').match(/[0-9a-fA-F]{40,}/)?.[0]?.toLowerCase();
  assert.ok(fpHex, 'fingerprint is served');

  const p = expectStatus(await tr.req('/api/pairing', { method: 'POST', body: {} }), is2xx, 'trainer creates a pairing code');
  assert.ok(typeof p.json?.code === 'string' && p.json.code.length > 0, `response has a code: ${p.text.slice(0, 200)}`);
  assert.ok(p.json.qr !== undefined, 'response has a qr payload');
  const qr = (typeof p.json.qr === 'string' ? p.json.qr : JSON.stringify(p.json.qr));
  const qrFlat = qr.replace(/[:\s"]/g, '').toLowerCase();
  assert.ok(qrFlat.includes(fpHex), 'QR payload carries the certificate fingerprint');
  assert.ok(qr.includes(`127.0.0.1:${srv.port}`) || qr.includes(`localhost:${srv.port}`) || qr.includes(String(srv.port)), 'QR payload carries the current address');
  assert.match(qr, /hub/i, 'QR payload names the hub id');
  const health = await client(srv.url).req('/api/health');

  // Claim once.
  const device = client(srv.url);
  const c1 = await device.req('/api/pairing/claim', { method: 'POST', body: { code: p.json.code, deviceId: 'device-test-A' } });
  assert.ok(is2xx(c1.status), `first claim succeeds, got ${c1.status} ${c1.text.slice(0, 200)}`);
  assert.ok(device.cookie, 'claim gives the device a session');
  const c2 = await client(srv.url).req('/api/pairing/claim', { method: 'POST', body: { code: p.json.code, deviceId: 'device-test-B' } });
  assert.ok(is4xx(c2.status), `second claim of the same code fails, got ${c2.status}`);
  assert.match(c2.text, /used/, 'second claim reports used');

  // Expiry: 5 minutes.
  const p2 = expectStatus(await tr.req('/api/pairing', { method: 'POST', body: {} }), is2xx, 'second code');
  await setClock(srv, T0 + 5 * MIN + 1000);
  const late = await client(srv.url).req('/api/pairing/claim', { method: 'POST', body: { code: p2.json.code, deviceId: 'device-test-C' } });
  assert.ok(is4xx(late.status), `claim after 5 minutes fails, got ${late.status}`);
  assert.match(late.text, /expired/, 'late claim reports expired');
  const p3 = expectStatus(await tr.req('/api/pairing', { method: 'POST', body: {} }), is2xx, 'third code');
  await setClock(srv, T0 + 5 * MIN + 1000 + 4 * MIN);
  const inTime = await client(srv.url).req('/api/pairing/claim', { method: 'POST', body: { code: p3.json.code, deviceId: 'device-test-D' } });
  assert.ok(is2xx(inTime.status), `a claim 4 minutes after issue succeeds, got ${inTime.status}`);

  // Devices list and revoke.
  const before = expectStatus(await device.req('/api/me'), 200, 'paired device can call the API');
  const list = expectStatus(await tr.req('/api/devices'), 200, 'GET /api/devices');
  assert.ok(list.text.includes('device-test-A'), 'devices list shows the paired device');
  const del = await tr.req(`/api/devices/${encodeURIComponent('device-test-A')}`, { method: 'DELETE' });
  assert.ok(is2xx(del.status), `DELETE revokes the device, got ${del.status}`);
  const after = await device.req('/api/me');
  assert.equal(after.status, 401, 'the revoked device gets 401 on its next request');
  const list2 = expectStatus(await tr.req('/api/devices'), 200, 'GET /api/devices after revoke');
  assert.ok(!list2.text.includes('device-test-A') || /revoked/.test(list2.text), 'revoked device is gone or marked revoked');
  assert.ok(before && health);
});
