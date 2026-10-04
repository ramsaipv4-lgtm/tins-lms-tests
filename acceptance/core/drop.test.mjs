// SPEC §4.30 Dropping a learner: AC-55.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const STATE = {
  tickets: [
    { id: 'ticket:1', assignee: 'person:l2' }, { id: 'ticket:2', assignee: 'person:l1' },
    { id: 'ticket:3', assignee: null }, { id: 'ticket:4', assignee: 'person:l2' },
  ],
  reviews: [{ id: 'review:1', reviewer: 'person:l2' }, { id: 'review:2', reviewer: 'person:l3' }],
  teams: { 'team:alpha': ['person:l1', 'person:l3'], 'team:beta': ['person:l2', 'person:l4'] },
};

test('AC-55 the plan lists exactly that person\'s tickets, reviews and team', () => {
  const dropPlan = fn('dropPlan');
  const p = dropPlan(STATE, 'person:l2');
  assert.deepEqual([...p.unassignTickets].sort(), ['ticket:1', 'ticket:4']);
  assert.deepEqual(p.reassignReviews, ['review:1']);
  assert.equal(p.removeFromTeam, 'team:beta');
  assert.equal(p.archiveRepos, true);
  assert.equal(p.stopBots, true);
  const none = dropPlan(STATE, 'person:l9');
  assert.deepEqual(none.unassignTickets, []);
  assert.deepEqual(none.reassignReviews, []);
  assert.equal(none.removeFromTeam, null);
});

test('AC-55 undo restores team, repos and bots but does not list tickets', () => {
  const dropPlan = fn('dropPlan'), undoDropPlan = fn('undoDropPlan');
  const u = undoDropPlan(dropPlan(STATE, 'person:l2'));
  assert.equal(u.restoreTeam, 'team:beta');
  assert.equal(u.restoreRepos, true);
  assert.equal(u.resumeBots, true);
  assert.ok(!JSON.stringify(u).includes('ticket'), 'tickets stay reassigned');
  assert.equal(undoDropPlan(dropPlan(STATE, 'person:l3')).restoreTeam, 'team:alpha');
});
