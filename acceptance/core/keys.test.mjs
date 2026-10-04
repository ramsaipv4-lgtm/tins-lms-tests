// SPEC §4.25 Recovery key and crypto-shredding: AC-45, AC-46.
// SPEC §4.25 (settled in SPEC iteration 17): 32 bytes -> 32 words, one byte per word, 256-word list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { fn, enc, dec } from '../lib/core.mjs';

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const entropy = (seed) => { const r = mulberry32(seed); return new Uint8Array(32).map(() => Math.floor(r() * 256)); };
const hex = (b) => Buffer.from(b).toString('hex');
// Entropies that together contain every byte value 0..255.
const ALL_BYTES = Array.from({ length: 8 }, (_, k) => new Uint8Array(32).map((_, i) => k * 32 + i));

test('AC-45 32 bytes -> words -> the same 32 bytes (200 generated keys and all byte values)', () => {
  const toWords = fn('recoveryWords'), toEntropy = fn('wordsToEntropy');
  const cases = [...ALL_BYTES, new Uint8Array(32), new Uint8Array(32).fill(255), ...Array.from({ length: 200 }, (_, i) => entropy(i + 1))];
  for (const [i, e] of cases.entries()) {
    const words = toWords(e);
    assert.ok(Array.isArray(words), 'returns an array of words');
    for (const w of words) assert.match(w, /^[a-z]+$/, `case ${i}: words are lowercase letters`);
    const back = toEntropy(words);
    assert.equal(hex(back), hex(e), `case ${i} (${hex(e)}) round-trip`);
    assert.deepEqual(toWords(e), words, 'deterministic');
  }
});

test('AC-45 a misspelt word, an unknown word or a wrong count throws', () => {
  const toWords = fn('recoveryWords'), toEntropy = fn('wordsToEntropy');
  const vocab = new Set(ALL_BYTES.flatMap((e) => toWords(e)));
  const words = toWords(entropy(42));
  assert.equal(hex(toEntropy(words)), hex(entropy(42)));
  let misspelt = words[3].slice(0, -1) + (words[3].endsWith('q') ? 'x' : 'q');
  while (vocab.has(misspelt)) misspelt += 'q';
  assert.throws(() => toEntropy([...words.slice(0, 3), misspelt, ...words.slice(4)]), 'misspelt word');
  assert.throws(() => toEntropy([...words.slice(0, -1), 'zzzzqqq']), 'unknown word');
  assert.throws(() => toEntropy(words.slice(0, -1)), 'one word short');
  assert.throws(() => toEntropy([...words, words[0]]), 'one word too many');
});

test('AC-45 a key is written as exactly 32 words', () => {
  const toWords = fn('recoveryWords');
  assert.equal(toWords(entropy(7)).length, 32);
});

test('AC-45 the word list has 256 unique lowercase words', () => {
  const toWords = fn('recoveryWords');
  const vocab = new Set([...ALL_BYTES, ...Array.from({ length: 300 }, (_, i) => entropy(1000 + i))].flatMap((e) => toWords(e)));
  assert.equal(vocab.size, 256);
});

async function aesSeal(keyBytes, text) {
  const k = await webcrypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = new Uint8Array(12).fill(7);
  return { iv, ct: new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc(text))) };
}
async function aesOpen(keyBytes, { iv, ct }) {
  const k = await webcrypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return dec(new Uint8Array(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct)));
}

test('AC-46 data sealed with a person key opens after wrap/unwrap', async () => {
  const wrap = fn('wrapPersonKey'), unwrap = fn('unwrapPersonKey');
  const personKey = entropy(11), wrappingKey = entropy(12);
  const sealed = await aesSeal(personKey, 'coach note: slept 7 h');
  const wrapped = await wrap(personKey, wrappingKey);
  assert.ok(wrapped instanceof Uint8Array);
  assert.equal(Buffer.from(wrapped).includes(Buffer.from(personKey)), false, 'wrapped bytes must not contain the raw key');
  const back = await unwrap(wrapped, wrappingKey);
  assert.equal(hex(back), hex(personKey));
  assert.equal(await aesOpen(back, sealed), 'coach note: slept 7 h');
});

test('AC-46 shred removes that person\'s wrapped key and leaves the others untouched', async () => {
  const wrap = fn('wrapPersonKey'), shred = fn('shred');
  const wk = entropy(20);
  const keyring = {
    'person:l1': await wrap(entropy(21), wk),
    'person:l2': await wrap(entropy(22), wk),
    'person:l3': await wrap(entropy(23), wk),
  };
  const snapshot = Object.fromEntries(Object.entries(keyring).map(([k, v]) => [k, hex(v)]));
  const after = shred(keyring, 'person:l2');
  assert.deepEqual(Object.keys(after).sort(), ['person:l1', 'person:l3']);
  assert.equal(hex(after['person:l1']), snapshot['person:l1']);
  assert.equal(hex(after['person:l3']), snapshot['person:l3']);
  assert.deepEqual(Object.keys(shred(after, 'person:nobody')).sort(), ['person:l1', 'person:l3']);
});
