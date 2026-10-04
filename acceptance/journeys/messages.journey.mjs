// AC-90 Messages (A-2, A-3) (SPEC §6, §4.32).
// data-testids used: app-ready*, wa-<personId> (e.g. wa-person:l2), copy-all
// Accessible names used: nav /absentees|absent|messages|follow.?up/.
// Seed "attendance-day0": only l1 attended day 0; l2 (9876500002) and l3 (9876500003) are absent.
import { journey, see, tid, nav, until, step, at, P, NAMES, assert } from './_harness.mjs';

const clipSpy = () => {
  window.__clip = [];
  const orig = navigator.clipboard && navigator.clipboard.writeText && navigator.clipboard.writeText.bind(navigator.clipboard);
  if (navigator.clipboard) navigator.clipboard.writeText = (t) => { window.__clip.push(String(t)); return orig ? orig(t).catch(() => {}) : Promise.resolve(); };
  document.addEventListener('copy', (e) => { const t = e.clipboardData?.getData('text/plain') || String(getSelection()); if (t) window.__clip.push(t); });
};

journey({
  name: 'messages', acs: ['AC-90'], title: 'absentee list offers prefilled wa.me links per learner and Copy all puts every message on the clipboard',
  seeds: ['base', 'attendance-day0'], clock: at(0, '13:30'),
  async run(j) {
    const page = await j.actor('trainer', P.trainer, { permissions: ['clipboard-read', 'clipboard-write'], initScripts: [clipSpy] });
    await nav(page, /^(absentees|absent|messages|follow.?up|absent learners)$/i, 'absentee list');
    for (const [pid, digits] of [['person:l2', '919876500002'], ['person:l3', '919876500003']]) {
      const link = await see(tid(page, `wa-${pid}`), `wa-${pid}`, 30_000);
      const href = await link.getAttribute('href');
      const m = /^https:\/\/wa\.me\/(\d+)\?text=(.+)$/.exec(href || '');
      assert.ok(m, `wa-${pid} href should be https://wa.me/<digits>?text=… (got ${href})`);
      assert.equal(m[1], digits, `wa.me number for ${pid}`);
      assert.match(decodeURIComponent(m[2]), new RegExp(NAMES[pid].split(' ')[0]), 'message is personalised');
    }
    assert.equal(await tid(page, 'wa-person:l1').count(), 0, 'l1 attended and must not be in the absentee list');
    await step(page, 'absentee links');
    await (await see(tid(page, 'copy-all'), 'copy-all')).click();
    const text = await until(async () => {
      const spied = await page.evaluate(() => (window.__clip || []).join('\n'));
      const real = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      const t = spied || real;
      return /Liam Learner:\n/.test(t) && /Mira Learner:\n/.test(t) ? t : null;
    }, 'clipboard text with "Liam Learner:\\n…" and "Mira Learner:\\n…" (SPEC §4.32 copyAll format)');
    assert.match(text, /\n\n/, 'messages are separated by a blank line');
    await step(page, 'copied all');
  },
});
