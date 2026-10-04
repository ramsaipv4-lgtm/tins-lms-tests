// AC-99 Accessibility basics and AC-123 externalised strings (SPEC §6, §8).
// data-testids used: app-ready*
// Screens checked: for each role space (admin, trainer, learner), the home screen and every same-origin link in
// the app's navigation (<nav> or role="navigation"), up to 10 per role, opened by URL (SPA routes must be
// deep-linkable). The journeys' main screens are reachable from this navigation.
// AC-99 uses lib/a11y.mjs checkA11y (image alt, button/link names, form labels, 4.5:1 text contrast).
// AC-123 starts the server with LMS_PSEUDO_LOCALE=1 (SPEC gap G-4: the app then shows every string from
// packages/web/src/strings/en.json wrapped as ⟦…⟧) and fails on any visible text or placeholder/aria-label/
// title/alt that is not wrapped, ignoring seeded user data and course content (the fixture corpus) and
// anything inside <code>, <pre>, <canvas>, <svg>, [contenteditable] or [translate="no"].
import { journey, see, step, P, fixtureCorpus, assert } from './_harness.mjs';
import { checkA11y, formatViolations, untranslatedText } from '../lib/a11y.mjs';

const ROLES = [['admin', P.admin], ['trainer', P.trainer], ['learner', P.l1]];

async function screens(page, origin) {
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('nav a[href], [role="navigation"] a[href]')].map((a) => a.href));
  const out = ['/'];
  for (const h of hrefs) {
    try { const u = new URL(h); if (u.origin !== origin) continue; const p = u.pathname + u.search + u.hash; if (!out.includes(p)) out.push(p); } catch {}
    if (out.length >= 11) break;
  }
  return out;
}

for (const [role, who] of ROLES) {
  journey({
    name: `a11y-${role}`, acs: ['AC-99'], title: `no image-alt, button/link-name, label or contrast violations on the ${role} screens`,
    clock: Date.parse('2026-11-02T10:00:00+05:30'),
    async run(j) {
      const page = await j.actor(role, who);
      const paths = await screens(page, j.url);
      assert.ok(paths.length >= 2, `the ${role} home should offer navigation links (<nav> or role="navigation")`);
      const problems = [];
      for (const p of paths) {
        await j.open(page, p);
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await step(page, `${role} ${p}`);
        const v = await checkA11y(page);
        if (v.length) problems.push(`${p}\n${formatViolations(v)}`);
      }
      assert.equal(problems.length, 0, `accessibility violations on ${role} screens:\n${problems.join('\n')}`);
    },
  });
}

for (const [role, who] of ROLES) {
  journey({
    name: `pseudo-${role}`, acs: ['AC-123'], title: `every visible UI string on the ${role} screens comes from en.json (pseudo-locale)`,
    clock: Date.parse('2026-11-02T10:00:00+05:30'), serverEnv: { LMS_PSEUDO_LOCALE: '1' },
    async run(j) {
      const corpus = fixtureCorpus();
      const page = await j.actor(role, who);
      const paths = await screens(page, j.url);
      const problems = [];
      let wrapped = 0;
      for (const p of paths) {
        await j.open(page, p);
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await step(page, `${role} ${p}`);
        wrapped += await page.evaluate(() => (document.body.innerText.match(/⟦/g) || []).length);
        const bad = await untranslatedText(page, corpus);
        if (bad.length) problems.push(`${p}: ${bad.slice(0, 12).map((s) => JSON.stringify(s)).join(', ')}`);
      }
      assert.ok(wrapped > 0, 'with LMS_PSEUDO_LOCALE=1 the UI strings should be shown as ⟦…⟧ (SPEC AC-123)');
      assert.equal(problems.length, 0, `untranslated literals (not from en.json) on ${role} screens:\n${problems.join('\n')}`);
      await see(page.getByTestId('app-ready'), 'app shell');
    },
  });
}
