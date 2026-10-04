// SPEC §4.33 Certificate ids: AC-58.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn, enc } from '../lib/core.mjs';

const SECRET = enc('synthetic-certificate-secret-01');
const ISSUED = Date.UTC(2026, 11, 20, 10, 0, 0);
const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{12}$/;

test('AC-58 ids are 12 Crockford base32 characters and deterministic', async () => {
  const certificateId = fn('certificateId');
  const id = await certificateId(SECRET, 'person:l1', 'program:azure-1', ISSUED);
  assert.match(id, CROCKFORD);
  assert.equal(await certificateId(SECRET, 'person:l1', 'program:azure-1', ISSUED), id);
  const ids = new Set();
  for (let i = 0; i < 50; i++) {
    const x = await certificateId(SECRET, `person:l${i}`, 'program:azure-1', ISSUED);
    assert.match(x, CROCKFORD);
    ids.add(x);
  }
  assert.equal(ids.size, 50);
});

test('AC-58 verification passes for the right inputs and fails for any changed input or secret', async () => {
  const certificateId = fn('certificateId'), verify = fn('verifyCertificateId');
  const id = await certificateId(SECRET, 'person:l1', 'program:azure-1', ISSUED);
  assert.equal(await verify(id, SECRET, 'person:l1', 'program:azure-1', ISSUED), true);
  assert.equal(await verify(id, enc('synthetic-certificate-secret-02'), 'person:l1', 'program:azure-1', ISSUED), false, 'secret');
  assert.equal(await verify(id, SECRET, 'person:l2', 'program:azure-1', ISSUED), false, 'person');
  assert.equal(await verify(id, SECRET, 'person:l1', 'program:azure-2', ISSUED), false, 'program');
  assert.equal(await verify(id, SECRET, 'person:l1', 'program:azure-1', ISSUED + 1), false, 'issuedAt');
  const other = id.slice(0, 11) + (id[11] === '0' ? '1' : '0');
  assert.equal(await verify(other, SECRET, 'person:l1', 'program:azure-1', ISSUED), false, 'changed id');
});
