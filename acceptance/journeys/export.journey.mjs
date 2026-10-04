// AC-98 Export my data (SPEC §6, AC-74 GET /api/me/export).
// data-testids used: app-ready*
// Accessible names used: nav /settings|my data|profile|privacy/; button or link /export my data|download my data/.
// Seeds "appeal" + "cards": l1 and l2 both have attempts; l2 has a private error note.
// The download is a tar (optionally gzip); every file is scanned: l1's records are present, no other
// person's name, attempt or private text appears.
import { journey, see, nav, download, step, at, P, untar, assert } from './_harness.mjs';

const OTHERS = ['Liam Learner', 'Mira Learner', 'Private question of Liam', 'seed-c1-l2-day0-quiz'];

journey({
  name: 'export', acs: ['AC-98'], title: 'learner downloads their export and it contains only their own records',
  seeds: ['base', 'appeal', 'cards'], clock: at(1, '18:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    await nav(page, /^(settings|my data|profile|privacy|account)$/i, 'settings');
    const ctl = page.getByRole('button', { name: /export my data|download my data/i }).or(page.getByRole('link', { name: /export my data|download my data/i }));
    const file = await download(page, ctl, 'export my data');
    await step(page, 'downloaded');
    const files = untar(file.bytes);
    assert.ok(files.length > 0, `the export ${file.name} should be a tar with files`);
    const all = files.map((f) => `${f.path}\n${Buffer.from(f.bytes).toString('utf8')}`).join('\n');
    assert.match(all, /person:l1|Lena Learner/, "the export contains the learner's own records");
    assert.match(all, /seed-c1-l1-day0-quiz|Which command creates a new Kettle site/, "the export contains the learner's attempt or cards");
    for (const s of OTHERS) assert.ok(!all.includes(s), `the export must not contain another person's data: found "${s}"`);
    await see(page.getByTestId('app-ready'), 'app shell after export');
  },
});
