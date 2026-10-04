// AC-80 Admin sets up a class (SPEC §6).
// data-testids used: app-ready*, create-class, gate-report, gate-check-<checkId>* (data-state="pass|fail|waived"),
//   class-schedule*, schedule-day-<index>*                       (* = not named in SPEC, see TESTIDS.md)
// Accessible names used: fields labelled /program/, /cohort/, /class name/, /start date|first day/;
//   file field labelled /package/; buttons /publish/.
// Flow: admin signs in (org-only seed) -> fills program, cohort, class -> create-class -> uploads the fixture
// package as a ustar tar -> gate report shows G1..G8 all passing -> publish -> schedule lists days 0..2.
import { journey, see, tid, nav, click, fill, fillIfPresent, upload, waitText, step, assert, P, packageTar } from './_harness.mjs';

const GATE = ['G1-files', 'G2-readme', 'G3-diagnostic', 'G4-script-times', 'G5-links', 'G6-code-lang', 'G7-graded', 'G8-cards'];

journey({
  name: 'admin-setup', acs: ['AC-80'], title: 'admin creates program, cohort and class, uploads the package, sees a passing gate, publishes',
  seeds: ['org-only'], clock: '2026-10-26T05:00:00Z',
  async run(j) {
    const page = await j.actor('admin', P.admin);
    if (!(await tid(page, 'create-class').isVisible())) await nav(page, /^(set ?up|classes|programs|new class|create class)$/i, 'class setup');
    await fill(page, /program( name)?/i, 'Kettle Track (journey)');
    await fill(page, /cohort( name)?/i, 'Batch J1');
    await fill(page, /class name/i, 'Class J1');
    await fillIfPresent(page, /start date|first day/i, '2026-11-02');
    await step(page, 'program cohort class filled');
    await (await see(tid(page, 'create-class'), 'create-class')).click();

    await upload(page, page.getByLabel(/package/i), packageTar(), 'package upload field labelled "package"');
    const report = await see(tid(page, 'gate-report'), 'gate-report', 60_000);
    await step(page, 'gate report');
    for (const id of GATE) {
      const row = await see(report.getByTestId(`gate-check-${id}`), `gate-check-${id} in gate-report`);
      assert.equal(await row.getAttribute('data-state'), 'pass', `gate check ${id} should pass for the fixture package`);
    }
    await click(page, /^publish( package| class)?$/i, 'publish button');
    const schedule = await see(tid(page, 'class-schedule'), 'class-schedule after publishing', 30_000);
    for (const d of [0, 1, 2]) await see(schedule.getByTestId(`schedule-day-${d}`), `schedule-day-${d}`);
    await waitText(schedule, /2026|Nov|11/, 'class schedule dates');
    await step(page, 'class schedule');
  },
});
