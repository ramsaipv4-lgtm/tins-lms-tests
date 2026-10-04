// SPEC §7: AC-113 encrypted backups to S3/R2, Google Drive and a folder, restored byte-identical (fakes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapter, need } from '../lib/adapters.mjs';
import { startFakeS3 } from '../fixtures/fakes/s3.mjs';
import { startFakeDrive } from '../fixtures/fakes/gdrive.mjs';
import { PLANTED } from '../lib/secrets.mjs';

const MARK = 'BACKUP-PLAINTEXT-MARKER-81fe';
const payload = (() => { const t = new TextEncoder().encode(`${MARK}\n`.repeat(200)); const b = new Uint8Array(t.length + 256); b.set(t); for (let i = 0; i < 256; i++) b[t.length + i] = i; return b; })();
let s3, drive;
before(async () => { s3 = await startFakeS3(); drive = await startFakeDrive(); });
after(async () => { await s3?.close(); await drive?.close(); });
const containsMark = (buf) => Buffer.from(buf).includes(Buffer.from(MARK));

async function roundTrip(mod, target, uploadedBytes) {
  const backup = need(mod, 'backup'), restore = need(mod, 'restore');
  const { ref } = await backup(target, { name: 'hub-backup-test.tar', bytes: payload, passphrase: PLANTED.passphrase });
  assert.ok(ref !== undefined, 'backup returns a ref');
  const up = uploadedBytes();
  assert.ok(up.length > 0, 'something was uploaded');
  for (const b of up) {
    assert.ok(!containsMark(b), 'the target never sees plaintext');
    assert.ok(!Buffer.from(b).includes(Buffer.from(PLANTED.passphrase)), 'the passphrase is not uploaded');
  }
  const back = await restore(target, { ref, passphrase: PLANTED.passphrase });
  assert.deepEqual(Buffer.from(back), Buffer.from(payload), 'restore is byte-identical');
  await assert.rejects(restore(target, { ref, passphrase: 'wrong-passphrase-test' }), 'a wrong passphrase cannot restore');
}

test('AC-113 S3/R2 target: encrypted upload, byte-identical restore', { timeout: 60_000 }, async () => {
  const mod = await loadAdapter('backup');
  const target = need(mod, 'createS3Target')({ endpoint: s3.url, bucket: 'lms-backups', region: 'auto', accessKeyId: PLANTED.awsKeyId, secretAccessKey: PLANTED.s3Secret });
  await roundTrip(mod, target, () => s3.requests.filter((r) => r.method === 'PUT').map((r) => r.body));
});

test('AC-113 Google Drive target: encrypted upload, byte-identical restore', { timeout: 60_000 }, async () => {
  const mod = await loadAdapter('backup');
  const target = need(mod, 'createDriveTarget')({ apiUrl: drive.url, accessToken: 'test-secret-do-not-use-drive', folderId: 'folder-test' });
  await roundTrip(mod, target, () => drive.requests.filter((r) => r.method === 'POST').map((r) => r.body));
});

test('AC-113 USB/folder target: encrypted file, byte-identical restore', { timeout: 60_000 }, async () => {
  const mod = await loadAdapter('backup');
  const dir = mkdtempSync(join(tmpdir(), 'lms-backup-'));
  const target = need(mod, 'createFolderTarget')({ dir });
  const files = () => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push(readFileSync(p)); } }; walk(dir); return out; };
  await roundTrip(mod, target, files);
});
