// AC-169 Calendar sync and Google Forms opt-in (A-12, 1.11) (SPEC §6.3, §4.27 calendarSync, googleForms).
// data-testids used: app-ready*
// Accessible names used: admin nav /settings|switches|features/, checkboxes/switches /calendar sync/, /google forms/;
//   trainer controls /calendar/ (e.g. "Sync to calendar") and /google forms/ (e.g. "Export to Google Forms") on the
//   schedule and quiz screens. Using the adapters against fakes is covered by acceptance/adapters/google.test.mjs (AC-114).
import { journey, nav, control, clickIfPresent, until, step, at, P, assert } from './_harness.mjs';

async function trainerControls(t) {
  const found = { cal: false, forms: false };
  for (const re of [/^(schedule|class schedule|days)$/i, /^(quiz|quizzes|assessments)$/i]) {
    if (!(await control(t, re, { timeout: 2000 }))) continue;
    await nav(t, re, 'trainer screen');
    found.cal ||= !!(await control(t, /calendar/i, { timeout: 1500, roles: ['button', 'link', 'checkbox', 'switch'] }));
    found.forms ||= !!(await control(t, /google forms/i, { timeout: 1500, roles: ['button', 'link', 'checkbox', 'switch'] }));
  }
  return found;
}

journey({
  name: 'google-optin', acs: ['AC-169'], title: 'calendar sync and Google Forms are hidden until their switches are on', clock: at(0, '07:00'),
  async run(j) {
    const t = await j.actor('trainer', P.trainer);
    const off = await trainerControls(t);
    assert.deepEqual(off, { cal: false, forms: false }, 'with the switches off, no calendar sync or Google Forms controls are shown');
    await step(t, 'hidden when off');
    const a = await j.actor('admin', P.admin);
    await nav(a, /^(settings|switches|features|feature switches)$/i, 'switches');
    for (const re of [/calendar sync/i, /google forms/i]) await a.getByRole('checkbox', { name: re }).or(a.getByRole('switch', { name: re })).first().check();
    await clickIfPresent(a, /^(save|apply)$/i, 2000);
    await step(a, 'switches on');
    await until(async () => { await t.reload(); await t.getByTestId('app-ready').waitFor(); const on = await trainerControls(t); return on.cal && on.forms; }, 'calendar sync and Google Forms controls shown once on', 45_000, 1000);
    await step(t, 'shown when on');
  },
});
