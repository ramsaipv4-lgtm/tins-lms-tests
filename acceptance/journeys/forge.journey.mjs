// AC-170 Practice forge first (§20.1, D-34) (SPEC §6.3).
// data-testids used: app-ready*, forge-exercise* (data-state="todo|done")
// Accessible names used: learner nav /forge|repos|git/; inside forge-exercise text /practice forge|forgejo/ and a
//   button /check|verify|i('ve)? done it/; nav /settings|profile|accounts/; field /github user(name)?/;
//   button /link( github)?/; text /github pass/ and button /move (my )?practice repos/.
// Completing the exercise needs a practice forge: the suite's fake Forgejo (fixtures/fakes, AC-112) is started by the
// adapters tests; here the hub must be configured with LMS_FORGEJO_URL (SPEC gap G-10). When the hub reports no
// practice forge, this journey fails with that message.
import { journey, see, tid, nav, click, fill, until, waitText, step, at, P } from './_harness.mjs';

journey({
  name: 'forge', acs: ['AC-170'], title: 'learner without GitHub does the forge exercise on Forgejo; linking GitHub later offers the GitHub pass and moves practice repos',
  clock: at(1, '11:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(forge|repos|git|my repos)$/i, 'forge');
    const ex = await see(tid(l1, 'forge-exercise'), 'forge-exercise', 30_000);
    await waitText(ex, /practice forge|forgejo/i, 'the exercise on the practice forge');
    await ex.getByRole('button', { name: /check|verify|i('ve)? done it/i }).first().click();
    await until(async () => (await ex.getAttribute('data-state')) === 'done', 'the forge exercise completed on Forgejo', 45_000, 1000);
    await step(l1, 'forge exercise done');
    await nav(l1, /^(settings|profile|accounts|linked accounts)$/i, 'accounts');
    await fill(l1, /github user(name)?/i, 'lena-learner-synthetic');
    await click(l1, /^link( github)?( account)?$/i, 'link GitHub');
    await waitText(l1.locator('body'), /github pass/i, 'the GitHub pass offered');
    await see(l1.getByRole('button', { name: /move (my )?practice repos/i }), 'move practice repos');
    await step(l1, 'github pass offered');
  },
});
