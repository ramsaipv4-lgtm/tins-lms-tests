// SPEC §4.31 Retention: AC-56. Dates avoid 29 February so "1 year" and "3 years" are the same
// whether counted as calendar years or as 365-day years.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const DAY = 86400_000;
const CREATED = Date.UTC(2025, 2, 1);        // 2025-03-01
const BATCH_END = Date.UTC(2028, 2, 1);      // 2028-03-01
const RESULTS = Date.UTC(2028, 3, 15);       // 2028-04-15
const docs = [
  { id: 'integrity:1', type: 'integrity', createdAt: CREATED, batchEndedAt: BATCH_END, resultsAt: RESULTS },
  { id: 'chat:1', type: 'chat', createdAt: CREATED, batchEndedAt: BATCH_END, resultsAt: RESULTS },
  { id: 'container:1', type: 'container', createdAt: CREATED, batchEndedAt: BATCH_END, resultsAt: RESULTS },
  { id: 'grade:1', type: 'grade', createdAt: CREATED, batchEndedAt: BATCH_END, resultsAt: RESULTS },
  { id: 'certificate:1', type: 'certificate', createdAt: CREATED, batchEndedAt: BATCH_END, resultsAt: RESULTS },
];
const BOUNDARY = {
  'integrity:1': RESULTS + 180 * DAY,
  'chat:1': Date.UTC(2026, 2, 1),            // createdAt + 1 year (365 days)
  'container:1': BATCH_END,
};
const PSEUDO_AT = Date.UTC(2031, 2, 1);      // batchEndedAt + 3 years (1095 days)

test('AC-56 each delete rule triggers exactly at its boundary, not one millisecond before', () => {
  const retentionDue = fn('retentionDue');
  assert.equal(BOUNDARY['chat:1'] - CREATED, 365 * DAY);
  for (const [id, at] of Object.entries(BOUNDARY)) {
    const doc = docs.filter((d) => d.id === id);
    assert.deepEqual(retentionDue(doc, at - 1).delete, [], `${id} one ms before`);
    assert.deepEqual(retentionDue(doc, at).delete, [id], `${id} at the boundary`);
    assert.deepEqual(retentionDue(doc, at + 400 * DAY).delete, [id], `${id} long after`);
  }
});

test('AC-56 grades and certificates are pseudonymised after 3 years and never deleted', () => {
  const retentionDue = fn('retentionDue');
  assert.equal(PSEUDO_AT - BATCH_END, 1095 * DAY);
  const graded = docs.filter((d) => d.type === 'grade' || d.type === 'certificate');
  const before = retentionDue(graded, PSEUDO_AT - 1);
  assert.deepEqual(before, { delete: [], pseudonymise: [] });
  const at = retentionDue(graded, PSEUDO_AT);
  assert.deepEqual([...at.pseudonymise].sort(), ['certificate:1', 'grade:1']);
  assert.deepEqual(at.delete, []);
  const all = retentionDue(docs, PSEUDO_AT + 50 * 365 * DAY);
  assert.deepEqual([...all.delete].sort(), ['chat:1', 'container:1', 'integrity:1']);
  assert.ok(!all.delete.includes('grade:1') && !all.delete.includes('certificate:1'));
  assert.deepEqual([...all.pseudonymise].sort(), ['certificate:1', 'grade:1']);
});
