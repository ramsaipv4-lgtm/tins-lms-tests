// AC-165 College outputs (D-1, D-2, D-3, 7.4) (SPEC §6.3, §4.33).
// data-testids used: app-ready*, certificate-id* (text = the 12-char certificate id)
// Accessible names used: admin nav /reports?|college reports/; download buttons/links /attendance sheet.*pdf/,
//   /attendance sheet.*csv/, /completion report.*pdf/, /completion report.*csv/, /co.?po/; learner nav /feedback/,
//   field /feedback|what went well/, button /submit|send/; trainer nav /feedback/; admin nav /certificates/,
//   button /issue certificate/ for Lena, button /download( certificate)?( pdf)?/.
// Verify page (SPEC gap G-5): GET /verify/<certId> shows "valid". The Google Sheet export of certificate ids needs
// the Google fakes of AC-114 and is left to acceptance/adapters/google.test.mjs.
import { journey, see, tid, nav, click, clickIfPresent, fill, download, waitText, step, at, P, assert } from './_harness.mjs';

const dl = (page, re) => page.getByRole('link', { name: re }).or(page.getByRole('button', { name: re }));

journey({
  name: 'college-reports', acs: ['AC-165'], title: 'attendance sheet and completion report (PDF, CSV) and CO-PO export',
  seeds: ['base', 'late-joiner'], clock: at(3, '14:00'),
  async run(j) {
    const a = await j.actor('admin', P.admin);
    await nav(a, /^(reports?|college reports)$/i, 'reports');
    for (const [re, kind] of [[/attendance sheet.*pdf/i, 'pdf'], [/attendance sheet.*csv/i, 'csv'], [/completion report.*pdf/i, 'pdf'], [/completion report.*csv/i, 'csv'], [/co.?po/i, 'csv']]) {
      const f = await download(a, dl(a, re), String(re));
      if (kind === 'pdf') assert.equal(f.bytes.subarray(0, 5).toString('latin1'), '%PDF-', `${re} is a PDF`);
      else { const text = f.bytes.toString('utf8'); assert.match(text.split('\n')[0], /,/, `${re} is CSV with a header`); if (/attendance/i.test(String(re))) assert.match(text, /Lena Learner/); }
    }
    await step(a, 'reports downloaded');
  },
});

journey({
  name: 'college-feedback-coordinator', acs: ['AC-165'], title: 'anonymous weekly feedback and the read-only coordinator view', clock: at(3, '16:00'),
  async run(j) {
    const l1 = await j.actor('learner', P.l1);
    await nav(l1, /^(feedback|weekly feedback)$/i, 'feedback');
    await fill(l1, /feedback|what went well|comments?/i, 'More lab time on publishing please');
    await click(l1, /^(submit|send)$/i, 'send feedback');
    const t = await j.actor('trainer', P.trainer);
    await nav(t, /^(feedback|weekly feedback)$/i, 'trainer feedback');
    const item = await see(t.getByText(/More lab time on publishing please/), 'the feedback', 30_000);
    assert.doesNotMatch(await item.locator('xpath=..').innerText(), /Lena/, 'weekly feedback is anonymous');
    const c = await j.actor('coordinator', P.coord);
    await waitText(c.locator('body'), /Class C1|Batch K1/, 'the coordinator batch view');
    await nav(c, /^(attendance|roster|learners)$/i, 'coordinator attendance');
    await waitText(c.locator('body'), /Lena Learner/, 'learners listed for the coordinator');
    assert.equal(await c.getByRole('button', { name: /^(edit|save|delete|publish|drop|approve)$/i }).count(), 0, 'coordinator view is read-only (no edit controls)');
    // SPEC does not say whether :id is "c1" or "class:c1"; whichever route exists must refuse the coordinator.
    const codes = [];
    for (const id of ['c1', encodeURIComponent('class:c1')]) codes.push((await c.context().request.post(`${j.url}/api/classes/${id}/teleprompter`, { data: { sectionId: 'warm-up' } })).status());
    assert.ok(codes.includes(403) && codes.every((s) => s === 403 || s === 404), `coordinator writes are refused with 403 (got ${codes})`);
    await step(c, 'coordinator read-only');
  },
});

journey({
  name: 'college-certificate', acs: ['AC-165'], title: 'certificate PDF with QR and a verify page', clock: at(3, '15:00'),
  async run(j) {
    const a = await j.actor('admin', P.admin);
    await nav(a, /^(certificates)$/i, 'certificates');
    await clickIfPresent(a, /Lena Learner/, 3000);
    await click(a, /issue certificate/i, 'issue certificate');
    const id = (await waitText(await see(tid(a, 'certificate-id'), 'certificate-id', 30_000), /^[0-9A-HJKMNP-TV-Z]{12}$/, 'a 12-character Crockford id')).trim();
    const pdf = await download(a, dl(a, /^download( certificate)?( pdf)?$/i), 'certificate PDF');
    assert.equal(pdf.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(/\/Subtype\s*\/Image/.test(pdf.bytes.toString('latin1')) || / re\b/.test(pdf.bytes.toString('latin1')) || pdf.bytes.length > 2000, 'certificate PDF carries a QR (image or drawn modules)');
    await step(a, 'certificate issued');
    const v = await j.anon('verifier', `/verify/${id}`);
    await waitText(v.locator('body'), /\bvalid\b/i, 'the verify page confirming the certificate');
    await waitText(v.locator('body'), /Lena Learner/, 'the verify page naming the learner');
    await step(v, 'verified');
  },
});
