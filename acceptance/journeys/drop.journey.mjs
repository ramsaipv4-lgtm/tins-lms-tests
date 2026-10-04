// AC-152 Drop switch (F-03) (SPEC §6.3, §4.30).
// data-testids used: app-ready*, roster-<personId>*, drop-confirm*, attendance-code
// Accessible names used: trainer nav /roster|learners|class/; in roster-person:l2: button /drop/, later /undo|restore|re-?activate/;
//   button /confirm|drop/ in drop-confirm.
// Seed: l2 is in team-a and assigned ticket "Add a health endpoint".
import { journey, see, notSee, tid, nav, clickIfPresent, waitText, step, at, P } from './_harness.mjs';

journey({
  name: 'drop', acs: ['AC-152'], title: 'drop confirmation lists the dropPlan actions; learner leaves roll and live quiz; switching back restores team and repo access',
  clock: at(1, '11:00'),
  async run(j) {
    const t = await j.actor('trainer', P.trainer);
    await nav(t, /^(roster|learners|class|people)$/i, 'roster');
    const row = await see(tid(t, 'roster-person:l2'), 'roster-person:l2', 30_000);
    await row.getByRole('button', { name: /^drop/i }).click();
    const dlg = await see(tid(t, 'drop-confirm'), 'drop-confirm');
    const text = await dlg.innerText();
    for (const [re, what] of [[/Add a health endpoint|ticket/i, 'tickets to unassign'], [/team/i, 'team removal'], [/repo/i, 'repo archive'], [/bot/i, 'bots stopped']]) {
      if (!re.test(text)) throw new Error(`drop confirmation should list ${what} (dropPlan, SPEC §4.30)`);
    }
    await step(t, 'drop confirmation');
    await dlg.getByRole('button', { name: /^(confirm|drop|confirm drop)$/i }).click();
    await waitText(tid(t, 'roster-person:l2'), /dropped/i, 'l2 shown as dropped');

    await nav(t, /^(attendance|take attendance)$/i, 'attendance roll');
    await see(tid(t, 'attendance-code'), 'attendance-code');
    await notSee(tid(t, 'roster-person:l2'), 'l2 on the attendance roll after dropping');
    await see(tid(t, 'roster-person:l1'), 'l1 still on the roll');
    const l2 = await j.actor('l2', P.l2);
    await nav(l2, /^(quiz|live quiz)$/i, 'live quiz').catch(() => {});
    await waitText(l2.locator('body'), /dropped|no longer enrolled|not enrolled|left the class/i, 'the dropped learner told they left the class (no live quiz)');
    await step(l2, 'learner dropped');

    await nav(t, /^(roster|learners|class|people)$/i, 'roster');
    await tid(t, 'roster-person:l2').getByRole('button', { name: /undo|restore|re-?activate|switch back/i }).click();
    await clickIfPresent(t, /^(confirm|restore|yes)$/i, 3000);
    const restored = await waitText(tid(t, 'roster-person:l2'), /active|team-a|team a/i, 'l2 active again');
    if (/dropped/i.test(restored)) throw new Error('l2 should no longer show as dropped');
    await waitText(t.locator('body'), /team.?a/i, 'team restored');
    await waitText(t.locator('body'), /repo/i, 'repo access restored');
    await step(t, 'restored');
  },
});
