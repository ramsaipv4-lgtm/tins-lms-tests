// AC-96 File exchange (SPEC §6, AC-76).
// data-testids used: app-ready*, pkg-download, pkg-import, section-<id>
// Accessible names used: nav /packages?|files|file exchange/ (both); learner button /export submission|submission file/;
//   trainer file field /import submission|submission file/; result text /accepted|imported/.
// The phone-only learner (l3, enrolment profile "phone") is taken offline (context offline) before importing.
import { journey, see, tid, nav, upload, download, waitText, step, at, P, scriptSections, assert } from './_harness.mjs';

journey({
  name: 'files', acs: ['AC-96'], title: 'trainer downloads a day package, phone-only learner imports it and exports a submission, trainer imports it',
  clock: at(0, '12:00'),
  async run(j) {
    const [first] = scriptSections(0);
    const trainer = await j.actor('trainer', P.trainer);
    await nav(trainer, /^(packages?|files|file exchange|class package)$/i, 'trainer files');
    const pkg = await download(trainer, tid(trainer, 'pkg-download'), 'pkg-download');
    assert.ok(pkg.bytes.length > 100, 'the day package is not empty');
    await step(trainer, 'package downloaded');

    const learner = await j.actor('phone-learner', P.l3);
    await learner.context().setOffline(true);
    await nav(learner, /^(files|import|file exchange|import package)$/i, 'learner files');
    await upload(learner, tid(learner, 'pkg-import'), pkg.path, 'pkg-import');
    await nav(learner, /^(today|day 0|class|my class)$/i, 'day page');
    await see(tid(learner, `section-${first.id}`), `section-${first.id} from the imported package`, 30_000);
    await step(learner, 'imported content');
    await nav(learner, /^(files|file exchange|export)$/i, 'learner files');
    const sub = await download(learner, learner.getByRole('button', { name: /export submission|submission file|export my work/i }), 'export submission');
    await step(learner, 'submission exported');

    await upload(trainer, trainer.getByLabel(/import submission|submission file/i), sub.path, 'trainer submission import');
    await waitText(trainer.locator('body'), /accepted|imported/i, 'the submission accepted');
    await step(trainer, 'submission imported');
  },
});
