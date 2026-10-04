// AC-82 Attendance with the rotating code (SPEC §6, §4.5, AC-66).
// data-testids used: app-ready*, attendance-code, attendance-input, roster-<personId>* (e.g. roster-person:l1)
// Accessible names used: nav /attendance|check in/; submit button /submit|mark|check in|mark present/.
import { journey, see, tid, nav, control, waitText, step, at, P } from './_harness.mjs';

journey({
  name: 'attendance', acs: ['AC-82'], title: 'trainer shows the rotating code, learner enters it and is present, roster shows verified',
  clock: at(0, '09:02'),
  async run(j) {
    const trainer = await j.actor('trainer', P.trainer);
    await nav(trainer, /^(attendance|take attendance)$/i, 'trainer attendance screen');
    const codeText = await waitText(await see(tid(trainer, 'attendance-code'), 'attendance-code'), /\b\d{6}\b/, 'a 6-digit rotating code');
    const code = /\b(\d{6})\b/.exec(codeText)[1];
    await j.step(trainer, 'rotating code shown');

    const learner = await j.actor('learner', P.l1);
    await nav(learner, /^(attendance|check in|mark attendance)$/i, 'learner attendance screen');
    await (await see(tid(learner, 'attendance-input'), 'attendance-input')).fill(code);
    const submit = await control(learner, /^(submit|mark( me)? present|check in|send)$/i, { roles: ['button'], timeout: 2000 });
    if (submit) await submit.click(); else await tid(learner, 'attendance-input').press('Enter');
    await waitText(learner.locator('body'), /\bpresent\b/i, 'the learner seeing "present"');
    await step(learner, 'present');

    await waitText(await see(tid(trainer, 'roster-person:l1'), 'roster-person:l1', 30_000), /verified/i, "the trainer's roster row for l1 showing verified", 30_000);
    await step(trainer, 'roster verified');
  },
});
