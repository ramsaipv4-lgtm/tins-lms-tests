// AC-164 Corporate practice in the Shift (C-4, C-5, C-8, C-9, C-11, C-12) (SPEC §6.3).
// data-testids used: app-ready*, shift-start, incident-page*, sla-<ticketId>
// Accessible names used:
//   incident: nav /shift/; incident-page shows an acknowledge timer (m:ss) and button /acknowledge/.
//   change request: nav /deploy|deployments/; button /deploy to prod/ (disabled or refused without an approved
//     change request); button /new change request/; fields /summary|title/, /rollback/; button /submit/;
//     trainer nav /change requests|approvals/, button /approve/.
//   acceptance criteria: nav /tickets|board|backlog/; button /new ticket/; fields /title/, /acceptance criteria/;
//     button /create|save/; error text /acceptance criteria/.
//   runbook/ADR: nav /runbook|adr|templates/; field /runbook|content/; button /submit/; rubric rows (text /rubric/).
//   demo day: nav /demo day/; a slot with a time (hh:mm).
//   leaked-key drill: trainer nav /drills|leaked.?key/; button /start (leaked.?key )?drill/; learner sees /rotate/.
// Each practice is its own test.
import { journey, see, tid, nav, click, clickIfPresent, fill, waitText, until, step, at, P, shiftPack } from './_harness.mjs';

journey({
  name: 'corp-incident', acs: ['AC-164'], title: 'an incident page arrives with an acknowledge timer', clock: at(1, '10:00'),
  async run(j) {
    const p1 = shiftPack().tickets.find((t) => t.priority === 'p1');
    const l1 = await j.actor('learner', P.l1, { fakeClock: at(1, '10:00') });
    await nav(l1, /^(shift|the shift)$/i, 'Shift');
    await (await see(tid(l1, 'shift-start'), 'shift-start', 30_000)).click();
    await j.clock(at(1, '10:00') + (p1.arrivesAtMin + 0.5) * 60_000);
    const inc = await see(tid(l1, 'incident-page'), `incident-page for p1 ticket ${p1.id}`, 30_000);
    await waitText(inc, /\b\d{1,2}:\d{2}\b/, 'an acknowledge timer');
    await inc.getByRole('button', { name: /acknowledge/i }).click();
    await waitText(tid(l1, `sla-${p1.id}`), /acked|acknowledged/i, 'incident acknowledged on the SLA board');
    await step(l1, 'incident acknowledged');
  },
});

journey({
  name: 'corp-change', acs: ['AC-164'], title: 'a prod deploy needs an approved change request', clock: at(1, '11:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(deploy|deployments|release)$/i, 'deploy');
    const deploy = l1.getByRole('button', { name: /deploy to prod/i });
    await see(deploy, 'deploy to prod');
    if (await deploy.isEnabled()) { await deploy.click(); await waitText(l1.locator('body'), /change request/i, 'prod deploy refused without a change request'); }
    await click(l1, /new change request/i, 'new change request');
    await fill(l1, /summary|title/i, 'Publish the about page');
    await fill(l1, /rollback/i, 'Redeploy the previous build', { required: false });
    await click(l1, /^submit$/i, 'submit change request');
    const t = await j.actor('trainer', P.trainer);
    await nav(t, /^(change requests|approvals)$/i, 'approvals');
    await see(t.getByText(/Publish the about page/), 'the change request', 30_000);
    await click(t, /^approve$/i, 'approve');
    await until(async () => { await l1.reload(); await see(l1.getByTestId('app-ready'), 'app'); await nav(l1, /^(deploy|deployments|release)$/i, 'deploy'); return l1.getByRole('button', { name: /deploy to prod/i }).isEnabled(); }, 'deploy to prod enabled after approval', 40_000, 1000);
    await step(l1, 'deploy allowed');
  },
});

journey({
  name: 'corp-criteria', acs: ['AC-164'], title: 'tickets require acceptance criteria', clock: at(1, '11:30'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(tickets|board|backlog|sprint board)$/i, 'tickets');
    await click(l1, /new ticket/i, 'new ticket');
    await fill(l1, /^title$|ticket title/i, 'Add a contact page');
    await click(l1, /^(create|save)$/i, 'create without criteria');
    await waitText(l1.locator('body'), /acceptance criteria/i, 'a message requiring acceptance criteria');
    await fill(l1, /acceptance criteria/i, 'Given a visitor, when they open /contact, then they see the email address.');
    await click(l1, /^(create|save)$/i, 'create with criteria');
    await see(l1.getByText('Add a contact page'), 'the created ticket', 20_000);
    await step(l1, 'ticket with criteria');
  },
});

journey({
  name: 'corp-runbook', acs: ['AC-164'], title: 'runbook and ADR templates are graded by rubric', clock: at(2, '11:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    for (const kind of ['runbook', 'adr']) {
      await nav(l1, kind === 'runbook' ? /^(runbook|runbooks|templates)$/i : /^(adr|adrs|decision records?|templates)$/i, kind);
      await clickIfPresent(l1, kind === 'runbook' ? /^(runbook|new runbook)$/i : /^(adr|new adr|decision record)$/i, 2000);
      await fill(l1, /content|runbook|decision|context/i, kind === 'runbook' ? '1. Check kettle.toml\n2. Run kettle build --clean\n3. Republish' : 'Context: builds are slow. Decision: cache themes. Consequences: faster builds.');
      await click(l1, /^submit$/i, `submit ${kind}`);
      await waitText(l1.locator('body'), /rubric/i, `${kind} graded by rubric`);
    }
    await step(l1, 'graded by rubric');
  },
});

journey({
  name: 'corp-demo-drill', acs: ['AC-164'], title: 'demo day has a presentation slot and the leaked-key drill runs', clock: at(3, '10:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(demo day)$/i, 'demo day');
    await waitText(l1.locator('body'), /slot[\s\S]{0,80}\b\d{1,2}:\d{2}\b|\b\d{1,2}:\d{2}\b[\s\S]{0,80}slot/i, 'a presentation slot with a time');
    const t = await j.actor('trainer', P.trainer);
    await nav(t, /^(drills|leaked.?key drill|security drill)$/i, 'drills');
    await click(t, /start (leaked.?key )?drill/i, 'start leaked-key drill');
    await nav(l1, /^(shift|alerts|notifications|today)$/i, 'learner alerts');
    await waitText(l1.locator('body'), /rotate/i, 'the leaked-key alert asking to rotate the key', 30_000);
    await step(l1, 'drill alert');
  },
});
