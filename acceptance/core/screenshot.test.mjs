// SPEC §4.18 Screenshot parsing rules: AC-35, AC-36. OCR lines: acceptance/fixtures/core/ocr.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fn } from '../lib/core.mjs';
import { FIXTURES } from '../lib/paths.mjs';

const OCR = JSON.parse(readFileSync(join(FIXTURES, 'core', 'ocr.json'), 'utf8'));

function values(out) {
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.value]));
}

test('AC-35 diet screenshot: calories 1,850 -> 1850 (next line), protein 72.5 (same line), missing field null', () => {
  const apply = fn('applyParseRules');
  const out = apply(OCR.diet.lines, OCR.diet.rules);
  assert.deepEqual(values(out), OCR.diet.expected);
  assert.equal(out.fibre.line, null, 'a missing field has line null');
  assert.equal(typeof out.calories.line, 'number');
  assert.notEqual(out.calories.line, out.protein.line);
});

test('AC-35 expense screenshot: amount ₹1,234.50 -> 1234.5; Rs prefix ignored; missing field null', () => {
  const apply = fn('applyParseRules');
  const out = apply(OCR.expense.lines, OCR.expense.rules);
  assert.deepEqual(values(out), OCR.expense.expected);
  assert.equal(out.tip.line, null);
});

test('AC-35 anchors are case-insensitive and $ is ignored', () => {
  const apply = fn('applyParseRules');
  const rules = { app: 'x', fields: [{ name: 'total', anchor: 'TOTAL', pick: 'same-line-number' }, { name: 'steps', anchor: 'steps today', pick: 'next-line-number' }] };
  const out = apply(['Order', 'total $12,345.75', 'Steps Today', '8,042'], rules);
  assert.deepEqual(values(out), { total: 12345.75, steps: 8042 });
});

const ok = (fields) => ({ app: 'foodlog', fields });

test('AC-36 validateRules accepts good rules and rejects a long anchor, an invalid regex and a duplicate name', () => {
  const validateRules = fn('validateRules');
  assert.deepEqual(validateRules(OCR.diet.rules), []);
  assert.deepEqual(validateRules(OCR.expense.rules), []);
  assert.deepEqual(validateRules(ok([{ name: 'a', anchor: 'x'.repeat(200), pick: 'same-line-number' }])), [], '200 characters is allowed');
  const long = validateRules(ok([{ name: 'a', anchor: 'x'.repeat(201), pick: 'same-line-number' }]));
  assert.ok(Array.isArray(long) && long.length >= 1, 'anchor longer than 200 characters');
  assert.ok(validateRules(ok([{ name: 'a', anchor: '(unclosed', pick: 'same-line-number' }])).length >= 1, 'invalid regex');
  assert.ok(validateRules(ok([{ name: 'a', anchor: '\\q', pick: 'same-line-number' }])).length >= 1, 'invalid under the u flag');
  const dup = validateRules(ok([{ name: 'kcal', anchor: 'calories', pick: 'next-line-number' }, { name: 'kcal', anchor: 'energy', pick: 'same-line-number' }]));
  assert.ok(dup.length >= 1, 'duplicate field name');
  for (const p of [...long, ...dup]) assert.equal(typeof p, 'string');
});
