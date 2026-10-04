// AC-81 Learner joins (SPEC §6).
// data-testids used: app-ready*, tnc-accept, setup-check, items inside setup-check carry data-state="pass|fail"*
// Accessible names used: field /date of birth/; optional /full name|your name/, /roll/; buttons
//   /continue|next|join|create account|create passkey|sign up/.
// Join link format (SPEC gap G-3): <hub>/join/<code>. Passkey sign-up uses a CDP virtual authenticator.
import { journey, see, tid, control, fill, fillIfPresent, step, assert, until } from './_harness.mjs';

journey({
  name: 'learner-join', acs: ['AC-81'], title: 'learner opens the join link, accepts T&C, enters date of birth, sees the Day -1 setup check',
  clock: '2026-10-30T05:00:00Z',
  async run(j) {
    const page = await j.anon('newcomer', '/join/JOIN-C1-0001', { passkeys: true });
    await step(page, 'join link opened');
    const accept = await see(tid(page, 'tnc-accept'), 'tnc-accept', 30_000);
    if (await accept.evaluate((e) => e.type === 'checkbox' || e.getAttribute('role') === 'checkbox')) await accept.check(); else await accept.click();
    await step(page, 'T&C accepted');
    const setup = tid(page, 'setup-check');
    let dobDone = false;
    // Wizard: keep filling what is shown and pressing the forward button until the setup check appears.
    await until(async () => {
      if (await setup.isVisible()) return true;
      if (!dobDone) dobDone = await fill(page, /date of birth/i, '2001-05-14', { required: false, timeout: 1000 });
      await fillIfPresent(page, /full name|your name|^name$/i, 'Ravi Joiner');
      await fillIfPresent(page, /roll/i, 'R-101');
      if (await accept.isVisible().catch(() => false) && await accept.evaluate((e) => (e.type === 'checkbox' || e.getAttribute('role') === 'checkbox') && !e.checked).catch(() => false)) await accept.check();
      const next = await control(page, /^(continue|next|join( class)?|create account|create (a )?passkey|sign up|accept)$/i, { timeout: 1500, roles: ['button'] });
      if (next && await next.isEnabled()) await next.click();
      return setup.isVisible();
    }, 'the setup-check screen after joining', 45_000, 800);
    assert.ok(dobDone, 'the join flow should ask for the date of birth (field labelled "Date of birth")');
    await step(page, 'setup check');
    const items = setup.locator('[data-state]');
    await until(async () => (await items.count()) > 0, 'setup-check items with data-state');
    const states = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
    assert.ok(states.every((s) => s === 'pass' || s === 'fail'), `setup-check items must be green (pass) or red (fail), got ${states}`);
  },
});
