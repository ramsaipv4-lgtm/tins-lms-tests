// AC-160 At-risk digest and mistake clusters (A-3, A-4) (SPEC §6.3, §4.20, §4.22).
// data-testids used: app-ready*, digest*, digest-<personId>* (one row per learner), wa-<personId>, lab-clusters*
//   (each cluster is a role=listitem)
// Accessible names used: trainer nav /digest|at.?risk|friday digest/, /lab results|labs/; in a cluster: field /comment/,
//   button /send|post|comment/; learner nav /lab|results|feedback/.
// Seeds: late-joiner (l4: locked missed days -> watch), digest (l3: 50 overdue cards + last Shift 25% -> risk;
// day-1 lab: l1 and l2 fail [check-port, check-readme], l4 fails [check-readme], l3 passes).
import { journey, see, tid, nav, fill, waitText, until, step, FRIDAY, P, assert } from './_harness.mjs';

journey({
  name: 'digest', acs: ['AC-160'], title: 'Friday digest lists learners by level with reasons and prefilled messages; lab clusters by failing checks; one comment reaches every member',
  seeds: ['base', 'late-joiner', 'digest'], clock: FRIDAY('17:00'),
  async run(j) {
    const t = await j.actor('trainer', P.trainer);
    await nav(t, /^(digest|at.?risk|friday digest|at-risk digest)$/i, 'digest');
    const dg = await see(tid(t, 'digest'), 'digest', 30_000);
    const r3 = await waitText(await see(dg.getByTestId('digest-person:l3'), 'digest row for l3'), /risk/i, 'l3 at risk');
    assert.match(r3, /overdue|cards/i, 'reason: overdue cards'); assert.match(r3, /shift/i, 'reason: Shift score');
    const r4 = await waitText(await see(dg.getByTestId('digest-person:l4'), 'digest row for l4'), /watch/i, 'l4 on watch');
    assert.match(r4, /missed|locked|catch.?up/i, 'reason: locked missed days');
    const rows = await dg.locator('[data-testid^="digest-person:"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    assert.ok(rows.indexOf('digest-person:l3') < rows.indexOf('digest-person:l4'), 'risk listed before watch');
    const wa = await see(dg.getByTestId('wa-person:l3'), 'prefilled message for l3');
    assert.match(await wa.getAttribute('href'), /^https:\/\/wa\.me\/919876500003\?text=/);
    await step(t, 'digest');

    await nav(t, /^(lab results|labs|lab)$/i, 'lab results');
    const cl = await see(tid(t, 'lab-clusters'), 'lab-clusters', 30_000);
    const items = cl.getByRole('listitem');
    await until(async () => (await items.count()) >= 3, 'three clusters (2-failure, 1-failure, all passing)');
    const first = items.first();
    const ft = await first.innerText();
    assert.match(ft, /check-port/); assert.match(ft, /check-readme/); assert.match(ft, /Lena/); assert.match(ft, /Liam/);
    await fill(first, /comment/i, 'Check the port in kettle.toml before building.');
    await first.getByRole('button', { name: /^(send|post|comment)$/i }).click();
    await step(t, 'cluster comment');
    for (const who of [P.l1, P.l2]) {
      const p = await j.actor(who[0].slice(7), who);
      await nav(p, /^(lab|labs|results|feedback|lab results)$/i, 'learner lab feedback');
      await see(p.getByText('Check the port in kettle.toml before building.'), `cluster comment reaching ${who[0]}`, 30_000);
    }
  },
});
