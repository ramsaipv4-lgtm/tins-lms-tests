// AC-155 First run (§17.4) (SPEC §6.3).
// data-testids used: app-ready*, first-run*, home-learner*, tnc-accept, setup-check
// Accessible names used: in first-run, four buttons /join a class/, /connect to a hub/, /hosted service/,
//   /(this|on this) phone only/; fields /class code|join code/, /hub address/, /pairing code/;
//   buttons /continue|join|connect|next/. Hosted path: a sign-in screen naming the hosted service (/sign in/).
// Each path is its own test. The hub path pairs with a code from POST /api/pairing (AC-65) issued by the trainer.
import { journey, see, tid, click, control, fill, fillIfPresent, until, step, P } from './_harness.mjs';

const CHOICES = [/join a class/i, /connect to a hub/i, /hosted service/i, /(this|on this) phone only/i];

async function firstRun(j, label, opts) {
  const page = await j.anon(label, '/', opts);
  const fr = await see(tid(page, 'first-run'), 'first-run screen on a fresh app', 30_000);
  for (const re of CHOICES) await see(fr.getByRole('button', { name: re }).or(fr.getByRole('link', { name: re })), `first-run choice ${re}`);
  await step(page, 'four choices');
  return page;
}
async function forward(page, done, what) {
  await until(async () => {
    if (await done.isVisible()) return true;
    const acc = page.getByTestId('tnc-accept');
    if (await acc.isVisible().catch(() => false)) { if (await acc.evaluate((e) => e.type === 'checkbox')) await acc.check(); else await acc.click(); }
    await fillIfPresent(page, /date of birth/i, '2001-05-14');
    await fillIfPresent(page, /full name|your name|^name$/i, 'Ravi Joiner');
    const next = await control(page, /^(continue|next|join( class)?|connect|create account|create (a )?passkey|sign up|done|finish|go to home)$/i, { timeout: 1500, roles: ['button'] });
    if (next && await next.isEnabled()) await next.click();
    return done.isVisible();
  }, what, 45_000, 800);
}

journey({
  name: 'first-run-phone', acs: ['AC-155'], title: 'fresh app offers 4 choices; "this phone only" reaches the learner home', seeds: [],
  async run(j) {
    const page = await firstRun(j, 'fresh');
    await click(page, CHOICES[3], 'phone only');
    await forward(page, tid(page, 'home-learner'), 'learner home (phone only)');
    await step(page, 'home');
  },
});
journey({
  name: 'first-run-join', acs: ['AC-155'], title: 'join-a-class path with a code reaches the learner home',
  async run(j) {
    const page = await firstRun(j, 'fresh', { passkeys: true });
    await click(page, CHOICES[0], 'join a class');
    await fill(page, /class code|join code|^code$/i, 'JOIN-C1-0002');
    await forward(page, tid(page, 'home-learner').or(tid(page, 'setup-check')), 'learner home after joining');
    await step(page, 'home');
  },
});
journey({
  name: 'first-run-hub', acs: ['AC-155'], title: 'connect-to-a-hub path pairs with a code and reaches the home screen',
  async run(j) {
    await j.server.login(...P.trainer);
    const r = await j.server.request('/api/pairing', { method: 'POST', body: {} });
    if (r.status >= 300 || !r.json?.code) throw new Error(`POST /api/pairing should return { code } (SPEC AC-65), got ${r.status}`);
    const page = await firstRun(j, 'fresh', { passkeys: true });
    await click(page, CHOICES[1], 'connect to a hub');
    await fillIfPresent(page, /hub address|address/i, j.url);
    await fill(page, /pairing code|^code$/i, String(r.json.code));
    await forward(page, page.locator('[data-testid^="home-"]'), 'a home screen after pairing');
    await step(page, 'home');
  },
});
journey({
  name: 'first-run-hosted', acs: ['AC-155'], title: 'hosted-service path reaches the hosted sign-in screen', seeds: [],
  async run(j) {
    const page = await firstRun(j, 'fresh');
    await click(page, CHOICES[2], 'hosted service');
    await see(page.getByRole('heading', { name: /sign in|hosted/i }), 'the hosted service sign-in screen', 20_000);
    await step(page, 'hosted sign-in');
  },
});
