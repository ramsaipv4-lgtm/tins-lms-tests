// SPEC §4.5 Rotating attendance code: AC-11, AC-12.
// Known answers computed independently with node:crypto following SPEC §4.5: HMAC-SHA-256 over the
// 8-byte big-endian counter floor(now / 1000 / periodSec), RFC 4226 dynamic truncation (offset = low
// 4 bits of the last HMAC byte), code = value mod 10^6 left-padded to 6 digits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn, enc } from '../lib/core.mjs';

const SECRET = enc('synthetic-attendance-secret-0001');
const OTHER = enc('synthetic-attendance-secret-0002');
const T0 = 1791210600000; // 2026-10-05T14:30:00Z, start of a 60 s and of a 120 s period

const KNOWN_60 = [
  [T0, '414825'],
  [T0 + 60_000, '718864'],
  [T0 + 120_000, '546402'],
  [T0 + 180_000, '204335'],
  [T0 + 240_000, '052109'], // leading zero kept
];
const KNOWN_120 = [
  [T0, '677886'],
  [T0 + 120_000, '623897'],
  [T0 + 240_000, '052284'],
];

test('AC-11 known-answer codes (default 60 s period), 6 digits with leading zeros kept', async () => {
  const attendanceCode = fn('attendanceCode');
  for (const [now, code] of KNOWN_60) {
    const got = await attendanceCode(SECRET, now);
    assert.equal(got, code, `code at ${new Date(now).toISOString()}`);
    assert.match(got, /^\d{6}$/);
  }
});

test('AC-11 identical anywhere within one period, different in the next period', async () => {
  const attendanceCode = fn('attendanceCode');
  const first = await attendanceCode(SECRET, T0);
  for (const off of [1, 999, 30_000, 59_999]) assert.equal(await attendanceCode(SECRET, T0 + off), first, `offset ${off} ms`);
  assert.notEqual(await attendanceCode(SECRET, T0 + 60_000), first);
  assert.equal(await attendanceCode(SECRET, T0 + 60_000, 60), KNOWN_60[1][1], 'explicit periodSec 60 equals the default');
});

test('AC-11 known-answer codes with periodSec 120', async () => {
  const attendanceCode = fn('attendanceCode');
  for (const [now, code] of KNOWN_120) assert.equal(await attendanceCode(SECRET, now, 120), code);
  assert.equal(await attendanceCode(SECRET, T0 + 119_999, 120), KNOWN_120[0][1]);
});

test('AC-12 verification accepts current and previous period, rejects two periods old and other secret', async () => {
  const attendanceCode = fn('attendanceCode'), verify = fn('verifyAttendanceCode');
  const now = T0 + 120_000 + 15_000; // inside period T0+120s
  const current = await attendanceCode(SECRET, now);
  const previous = await attendanceCode(SECRET, now - 60_000);
  const twoOld = await attendanceCode(SECRET, now - 120_000);
  assert.equal(await verify(current, SECRET, now), true, 'current');
  assert.equal(await verify(previous, SECRET, now), true, 'previous');
  assert.equal(await verify(twoOld, SECRET, now), false, 'two periods old');
  assert.equal(await verify(current, OTHER, now), false, 'another secret');
  assert.equal(await verify(KNOWN_60[2][1], SECRET, T0 + 120_000), true, 'known current code');
  assert.equal(await verify(KNOWN_60[0][1], SECRET, T0 + 120_000), false, 'known code two periods old');
});

test('AC-12 periodSec 120 works the same way', async () => {
  const attendanceCode = fn('attendanceCode'), verify = fn('verifyAttendanceCode');
  const now = T0 + 240_000 + 5_000;
  assert.equal(await verify(await attendanceCode(SECRET, now, 120), SECRET, now, 120), true);
  assert.equal(await verify(KNOWN_120[1][1], SECRET, now, 120), true, 'previous 120 s period');
  assert.equal(await verify(KNOWN_120[0][1], SECRET, now, 120), false, 'two 120 s periods old');
  assert.equal(await verify(await attendanceCode(OTHER, now, 120), SECRET, now, 120), false, 'other secret');
});
