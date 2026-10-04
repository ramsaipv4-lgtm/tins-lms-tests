// SPEC §4.24 Export, manifest, archives and signed class packages: AC-42, AC-43, AC-44.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fn, enc } from '../lib/core.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const bin = new Uint8Array(1024).map((_, i) => (i * 37 + 11) & 0xff);
const FILES = [
  { path: 'roster.csv', bytes: enc('personId,name\nperson:l1,Learner One\n') },
  { path: 'boards/day1/page-1.excalidraw', bytes: enc('{"type":"excalidraw","elements":[]}') },
  { path: 'assets/logo.bin', bytes: bin },
  { path: 'content/empty.md', bytes: new Uint8Array(0) },
  { path: 'content/day1/quicklearn.md', bytes: enc('# Quick learn ✓ ünïcode\n') },
];
const same = (a, b) => {
  assert.equal(a.length, b.length, 'file count');
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].path, b[i].path);
    assert.ok(a[i].bytes instanceof Uint8Array, `${a[i].path}: bytes is a Uint8Array`);
    assert.equal(Buffer.from(a[i].bytes).toString('hex'), Buffer.from(b[i].bytes).toString('hex'), `${a[i].path} bytes`);
  }
};

test('AC-42 buildManifest lists sorted paths with sha256 and size', async () => {
  const buildManifest = fn('buildManifest');
  const m = await buildManifest(FILES);
  assert.equal(m.version, 1);
  const paths = FILES.map((f) => f.path).sort();
  assert.deepEqual(m.files.map((f) => f.path), paths);
  for (const f of FILES) {
    const e = m.files.find((x) => x.path === f.path);
    assert.equal(e.sha256, sha(f.bytes), `${f.path} sha256`);
    assert.equal(e.size, f.bytes.length, `${f.path} size`);
  }
});

test('AC-42 verifyManifest reports missing, extra and changed files exactly', async () => {
  const buildManifest = fn('buildManifest'), verifyManifest = fn('verifyManifest');
  const m = await buildManifest(FILES);
  assert.deepEqual(await verifyManifest(FILES, m), { missing: [], extra: [], changed: [] });
  const changedBytes = bin.slice(); changedBytes[500] ^= 1;
  const now = [
    ...FILES.filter((f) => f.path !== 'roster.csv' && f.path !== 'content/empty.md' && f.path !== 'assets/logo.bin'),
    { path: 'assets/logo.bin', bytes: changedBytes },
    { path: 'content/empty.md', bytes: enc('x') },
    { path: 'zz-extra.txt', bytes: enc('extra') },
    { path: 'aa-extra.txt', bytes: enc('extra') },
  ];
  const r = await verifyManifest(now, m);
  assert.deepEqual([...r.missing].sort(), ['roster.csv']);
  assert.deepEqual([...r.extra].sort(), ['aa-extra.txt', 'zz-extra.txt']);
  assert.deepEqual([...r.changed].sort(), ['assets/logo.bin', 'content/empty.md']);
});

test('AC-43 tarUnpack(tarPack(x)) returns x for text, binary, nested and empty files', () => {
  const tarPack = fn('tarPack'), tarUnpack = fn('tarUnpack');
  const archive = tarPack(FILES);
  assert.ok(archive instanceof Uint8Array);
  assert.equal(archive.length % 512, 0, 'ustar archives are made of 512-byte blocks');
  assert.equal(Buffer.from(archive.slice(257, 262)).toString('latin1'), 'ustar', 'POSIX ustar magic in the first header');
  same(tarUnpack(archive), FILES);
  same(tarUnpack(tarPack([])), []);
});

test('AC-43 long nested paths (over 100 characters) round-trip', () => {
  const tarPack = fn('tarPack'), tarUnpack = fn('tarUnpack');
  const long = `${'track1/'.repeat(8)}day12/assets/${'diagram-'.repeat(6)}final.svg`;
  assert.ok(long.length > 100 && long.length < 200);
  const files = [{ path: long, bytes: enc('<svg/>') }, { path: 'a.txt', bytes: enc('a') }];
  same(tarUnpack(tarPack(files)), files);
});

test('AC-43 the system tar -tf lists the same paths', (t) => {
  const tarPack = fn('tarPack');
  const archive = tarPack(FILES);
  const probe = spawnSync('tar', ['--version']);
  if (probe.error) { t.skip('system tar not available; tar -tf sub-assertion skipped'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'lms-tar-'));
  try {
    const f = join(dir, 'x.tar');
    writeFileSync(f, archive);
    const r = spawnSync('tar', ['-tf', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `tar -tf failed: ${r.stderr}`);
    const listed = r.stdout.split('\n').filter((l) => l && !l.endsWith('/'));
    assert.deepEqual(listed.sort(), FILES.map((x) => x.path).sort());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function flipInside(container, archive) {
  // Flip a byte that belongs to the archive payload when it can be located; else the middle byte.
  const hay = Buffer.from(container), needle = Buffer.from(archive.slice(0, 64));
  const at = hay.indexOf(needle);
  const pos = at >= 0 ? at + 600 : Math.floor(container.length / 2);
  const t = container.slice();
  t[pos] ^= 0x20;
  return t;
}

test('AC-44 a signed package opens with the right key; one changed byte fails; unknown key is untrusted', async () => {
  const gen = fn('generateSigningKeys'), sign = fn('signPackage'), open = fn('openPackage'), tarPack = fn('tarPack');
  const keys = await gen();
  const other = await gen();
  assert.equal(keys.publicJwk.kty, 'EC');
  assert.equal(keys.publicJwk.crv, 'P-256');
  assert.equal(keys.publicJwk.d, undefined, 'public JWK must not carry the private part');
  const archive = tarPack(FILES);
  const container = await sign(archive, keys.privateJwk);
  assert.ok(container instanceof Uint8Array);
  const ok = await open(container, [other.publicJwk, keys.publicJwk]);
  assert.equal(ok.ok, true);
  same(ok.files, FILES);
  const bad = await open(flipInside(container, archive), [keys.publicJwk]);
  assert.equal(bad.ok, false);
  assert.ok(['bad-signature', 'corrupt'].includes(bad.reason), `got ${bad.reason}`);
  const last = container.slice(); last[last.length - 1] ^= 0x01;
  const bad2 = await open(last, [keys.publicJwk]);
  assert.equal(bad2.ok, false);
  assert.ok(['bad-signature', 'corrupt'].includes(bad2.reason), `last byte changed: got ${bad2.reason}`);
  assert.deepEqual(await open(container, [other.publicJwk]), { ok: false, reason: 'untrusted' });
  assert.deepEqual(await open(container, []), { ok: false, reason: 'untrusted' });
  const junk = await open(enc('not a package'), [keys.publicJwk]);
  assert.equal(junk.ok, false);
});
