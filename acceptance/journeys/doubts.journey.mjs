// AC-91 Doubt queue (A-5) (SPEC §6).
// data-testids used: app-ready*, doubt-list* (each doubt is a role=listitem inside it)
// Accessible names used: nav /doubts|ask a doubt|questions/; field /your doubt|doubt|question/;
//   checkbox /anonymous|post anonymously/; buttons /post|ask|submit/, /upvote|\+1|vote/.
import { journey, see, tid, nav, click, fill, waitText, until, step, at, P, assert } from './_harness.mjs';

const NAMED = 'How do I preview the site before publishing?';
const ANON = 'Why does kettle build skip my drafts folder?';

async function post(page, text, anonymous) {
  await nav(page, /^(doubts|ask a doubt|questions|doubt queue)$/i, 'doubts');
  await fill(page, /your doubt|^doubt$|question/i, text);
  if (anonymous) await page.getByRole('checkbox', { name: /anonymous/i }).check();
  await click(page, /^(post|ask|submit|send)$/i, 'post doubt');
  await see(page.getByText(text), `doubt "${text}" in the queue`, 20_000);
}
async function upvote(page, text) {
  const item = tid(page, 'doubt-list').getByRole('listitem').filter({ hasText: text });
  await see(item, `doubt "${text}" for upvoting`, 30_000);
  await item.getByRole('button', { name: /upvote|\+1|vote/i }).first().click();
}

journey({
  name: 'doubts', acs: ['AC-91'], title: 'learners post doubts (one anonymous) and upvote; trainer view orders by votes and hides the anonymous author',
  clock: at(0, '10:30'),
  async run(j) {
    const l1 = await j.actor('l1', P.l1); await post(l1, NAMED, false);
    const l2 = await j.actor('l2', P.l2); await post(l2, ANON, true);
    const l3 = await j.actor('l3', P.l3);
    await nav(l3, /^(doubts|ask a doubt|questions|doubt queue)$/i, 'doubts');
    await upvote(l3, ANON); await upvote(l1, ANON);
    await step(l3, 'upvoted');

    const trainer = await j.actor('trainer', P.trainer);
    await nav(trainer, /^(doubts|doubt queue|questions)$/i, 'trainer doubts');
    const list = await see(tid(trainer, 'doubt-list'), 'doubt-list');
    await until(async () => {
      const items = await list.getByRole('listitem').allInnerTexts();
      const iAnon = items.findIndex((t) => t.includes(ANON)); const iNamed = items.findIndex((t) => t.includes(NAMED));
      return iAnon >= 0 && iNamed >= 0 && iAnon < iNamed;
    }, 'the anonymous doubt (2 votes) listed above the named one (0 votes)');
    const anonItem = list.getByRole('listitem').filter({ hasText: ANON });
    const anonText = await anonItem.innerText();
    assert.doesNotMatch(anonText, /Liam/i, 'the anonymous author must not be shown');
    assert.doesNotMatch(await list.innerText(), /Liam Learner/, "the anonymous author's name must not appear anywhere in the trainer's queue");
    await waitText(list.getByRole('listitem').filter({ hasText: NAMED }), /Lena/, 'the named author shown on the named doubt');
    await step(trainer, 'ordered by votes');
  },
});
