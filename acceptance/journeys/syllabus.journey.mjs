// AC-154 Verbal syllabus (§17.1) (SPEC §6.3).
// data-testids used: app-ready*, syllabus-draft*, change-log*
// Accessible names used: admin nav /syllabus/; field /topic notes|notes|topics/; button /draft( syllabus)?/;
//   button or link /confirmation pdf|download pdf|pdf for (the )?college/; button /save|confirm/.
import { journey, see, tid, nav, click, clickIfPresent, fill, download, waitText, step, at, P, assert } from './_harness.mjs';

const NOTES = 'Day 1: install Kettle and build a first site.\nDay 2: pages, templates and themes.\nDay 3: publish the site and fix broken links.';

journey({
  name: 'syllabus', acs: ['AC-154'], title: 'admin pastes topic notes, gets a drafted syllabus and a confirmation PDF; later changes go into a dated change log',
  clock: at(0, '08:00'),
  async run(j) {
    const page = await j.actor('admin', P.admin);
    await nav(page, /^(syllabus|syllabi)$/i, 'syllabus');
    await fill(page, /topic notes|^notes$|topics/i, NOTES);
    await click(page, /^draft( syllabus)?$|draft a syllabus/i, 'draft syllabus');
    const draft = await see(tid(page, 'syllabus-draft'), 'syllabus-draft', 30_000);
    await waitText(draft, /templates[\s\S]*publish|publish[\s\S]*templates/i, 'the drafted syllabus with the noted topics');
    await clickIfPresent(page, /^(save|confirm|save syllabus)$/i, 3000);
    const pdf = await download(page, page.getByRole('button', { name: /confirmation pdf|download pdf|pdf for (the )?college/i }).or(page.getByRole('link', { name: /confirmation pdf|download pdf|pdf for (the )?college/i })), 'confirmation PDF');
    assert.equal(pdf.bytes.subarray(0, 5).toString('latin1'), '%PDF-', 'confirmation is a PDF');
    await step(page, 'drafted and PDF');

    await j.clock(at(2, '08:00'));
    await fill(page, /topic notes|^notes$|topics/i, `${NOTES}\nDay 3: add a sitemap.`);
    await click(page, /^draft( syllabus)?$|draft a syllabus|update/i, 'redraft');
    await clickIfPresent(page, /^(save|confirm|save syllabus|save changes)$/i, 3000);
    const log = await see(tid(page, 'change-log'), 'change-log', 30_000);
    await waitText(log, /sitemap/i, 'the change in the cohort change log');
    await waitText(log, /2026-11-04|4 Nov(ember)? 2026|Nov(ember)? 4,? 2026|04\/11\/2026/, 'the change dated 4 Nov 2026');
    await step(page, 'change log');
  },
});
