// AC-162 Portfolio (B-7) (SPEC §6.3).
// data-testids used: app-ready*, portfolio-preview* (an <iframe> showing the generated site)
// Accessible names used: learner nav /portfolio/; button /build my portfolio/.
// Seed "portfolio": l1 has certificate 7KQ2M9X4TB1R and team-a has the badge "First merged PR".
import { journey, see, tid, nav, click, until, step, at, P } from './_harness.mjs';

journey({
  name: 'portfolio', acs: ['AC-162'], title: '"Build my portfolio" creates a site with repos, badges and certificates, previewable in the app',
  seeds: ['base', 'portfolio'], clock: at(3, '15:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    await nav(page, /^(portfolio|my portfolio)$/i, 'portfolio');
    await click(page, /build my portfolio/i, 'build my portfolio');
    await see(tid(page, 'portfolio-preview'), 'portfolio-preview', 45_000);
    const frame = page.frameLocator('[data-testid="portfolio-preview"]');
    await until(async () => {
      const t = await frame.locator('body').innerText().catch(() => '');
      return /Lena Learner/.test(t) && /First merged PR/i.test(t) && /7KQ2M9X4TB1R|certificate/i.test(t) && /repo/i.test(t);
    }, 'the preview showing name, badge, certificate and repos', 30_000);
    await step(page, 'portfolio preview');
  },
});
