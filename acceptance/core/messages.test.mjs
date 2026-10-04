// SPEC §4.32 Messages for other apps: AC-57.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const TEXT = 'Hi Asha & team? You missed Day 3 🙂\nCatch up here: https://hub.local/day/3?x=1&y=2 #now';

test('AC-57 Indian number formats give the same wa.me link', () => {
  const waLink = fn('waLink');
  const expected = `https://wa.me/919876543210?text=${encodeURIComponent(TEXT)}`;
  for (const phone of ['+91 98765-43210', '09876543210', '9876543210', '+919876543210', '98765 43210']) {
    assert.equal(waLink(phone, TEXT), expected, phone);
  }
});

test('AC-57 text with &, ?, emoji and newlines round-trips; a 7-digit number throws', () => {
  const waLink = fn('waLink');
  const link = waLink('9876543210', TEXT);
  const q = link.indexOf('?text=');
  assert.equal(link.slice(0, q), 'https://wa.me/919876543210');
  assert.equal(decodeURIComponent(link.slice(q + 6)), TEXT);
  assert.equal(link.slice(q + 6).includes('&'), false);
  assert.throws(() => waLink('9876543', 'hi'));
  assert.throws(() => waLink('98765432101', 'hi'));
});

test('AC-57 copyAll joins messages as "<name>:\\n<text>" separated by a blank line', () => {
  const copyAll = fn('copyAll');
  assert.equal(copyAll([{ name: 'Asha', text: 'You missed Day 3' }, { name: 'Ravi', text: 'Line 1\nLine 2' }]),
    'Asha:\nYou missed Day 3\n\nRavi:\nLine 1\nLine 2');
  assert.equal(copyAll([{ name: 'Asha', text: 'Hi' }]), 'Asha:\nHi');
});
