// SPEC §4.16 Stand-up bot: AC-33.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const ans = (blockers) => ({ yesterday: 'Finished the DNS lab', today: 'Start the storage lab', blockers });

test('AC-33 blocker words mark the stand-up blocked', () => {
  const parseStandup = fn('parseStandup');
  for (const b of ["Waiting on Ravi's PR", 'Blocked by the VPN', "I'm STUCK on the build", 'waiting for access to the repo',
    "Can't log in to the portal", 'I cannot reach the VM', 'Need help with the pipeline']) {
    const r = parseStandup(ans(b));
    assert.equal(r.blocked, true, JSON.stringify(b));
    assert.equal(typeof r.blockerText, 'string', `blockerText for ${JSON.stringify(b)}`);
  }
});

test('AC-33 negations, empty answers and partial words are not blocked', () => {
  const parseStandup = fn('parseStandup');
  for (const b of ['None', 'none', 'no blockers', 'No blockers', 'not blocked', 'Nothing', '', 'unblocked yesterday', 'The unstuckable test passed']) {
    assert.equal(parseStandup(ans(b)).blocked, false, JSON.stringify(b));
  }
  assert.equal(parseStandup(ans("Waiting on Ravi's PR")).blocked, true, 'sanity: a real blocker is still found');
});
