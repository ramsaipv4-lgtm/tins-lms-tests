// AC-217 Syntax Drop fill mode: placing the right pieces completes the template and the preview shows the expected
// result (fixture: css-flexbox level 1, whose preview iframe has three .box elements with equal top and increasing
// left); a wrong piece shows its effect in the preview, then breaks off, cracks the shield and is a Knowledge
// mistake (SPEC-games G6.1; games contract §13.T5 Syntax Drop; AC-217 r3 text).
// data-testids used: app-ready*, game-preview (html renderer: <iframe sandbox="">)
// Seeds: games-base, games-seen, games-samples (the builder's css-flexbox sample pack, D-G18).
import { assert, step, see, tid, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, openGame, controller, playSyntaxDrop, samplePack, ownPack, personDocs, idsOf, waitNewResult, T } from '../lib/games.mjs';

async function boxes(page) {
  const frame = page.frameLocator('[data-testid="game-preview"] iframe');
  const els = frame.locator('.box');
  const n = await els.count();
  const out = [];
  for (let i = 0; i < n; i++) out.push(await els.nth(i).boundingBox());
  return out.filter(Boolean);
}
async function iframeSandbox(page) {
  const f = page.locator('[data-testid="game-preview"] iframe').first();
  await see(f, 'the html preview iframe');
  return f.getAttribute('sandbox');
}
const oneRow = (b) => b.length === 3 && b.every((x) => Math.abs(x.y - b[0].y) <= 1) && b[0].x < b[1].x && b[1].x < b[2].x;

gamesJourney({
  name: 'syntax-drop-sample', acs: ['AC-217'], title: 'css-flexbox level 1: the right pieces complete it and the preview shows three boxes in one row',
  seeds: ['games-base', 'games-seen', 'games-samples'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const pack = samplePack('syntax-drop', 'css-flexbox');
    const lvl = pack.levels[0];
    await openGame(j, page, { gameId: 'syntax-drop', packId: 'css-flexbox', levelId: String(lvl.id) });
    const s = await playSyntaxDrop(page, controller(page, 'syntax-drop', 'act'), lvl, { stopWhen: (x) => x.status === 'won' || (x.extra?.slots?.length && x.extra.slots.every((y) => y.filled)) });
    assert.ok(s.extra.slots.every((y) => y.filled), 'every slot is filled with a right piece');
    assert.equal(await iframeSandbox(page), '', 'the html preview iframe has sandbox="" (no scripts)');
    const b = await boxes(page);
    await step(page, 'template complete');
    assert.ok(oneRow(b), `the preview shows three .box elements in one row: ${JSON.stringify(b)}`);
  },
});

gamesJourney({
  name: 'syntax-drop-wrong-piece', acs: ['AC-217'], title: 'a wrong piece shows its effect in the preview, breaks off, cracks the shield and is a Knowledge mistake',
  seeds: ['games-base', 'games-seen'], clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1);
    const lvl = ownPack('syntax-drop', 'sd-fill').levels[0];
    const decoys = new Set(lvl.pieces.filter((p) => p.decoy).map((p) => p.id));
    const before = idsOf(await personDocs(j, page, 'l1', 'gameResult'));
    const g = await openGame(j, page, { gameId: 'syntax-drop', packId: 'sd-fill', levelId: '1' });
    await g.act('start');
    // let right pieces pass (they come back) until a decoy falls; drop the decoy p-block into s1
    let s = await g.advanceUntil((x) => x.extra.piece && decoys.has(x.extra.piece.pieceId), 'a decoy piece to fall', { stepMs: 100 });
    const decoy = s.extra.piece.pieceId;
    const slot = decoy === 'p-block' ? 's1' : 's2';
    const shield0 = s.extra.shield; const k0 = s.knowledgeMistakes;
    await g.advanceGame(s.extra.piece.hitAtMs - s.clockMs);
    await g.act('drop', slot);
    s = await g.state();
    assert.equal(s.extra.previewPiece, decoy, 'the preview shows the wrong piece');
    assert.equal(s.knowledgeMistakes, k0 + 1, 'a Knowledge mistake');
    assert.equal(s.extra.shield, shield0 - T('syntaxDrop.shieldCrack'), 'the shield cracks by syntaxDrop.shieldCrack');
    const html = await page.frameLocator('[data-testid="game-preview"] iframe').locator('body').innerHTML();
    assert.ok(html.includes(lvl.pieces.find((p) => p.id === decoy).text), "the preview's HTML holds the wrong piece's text");
    if (decoy === 'p-block') assert.ok(!oneRow(await boxes(page)), 'with display: block the boxes are not in one row');
    await step(page, 'wrong piece previewed');
    s = await g.advanceGame(T('syntaxDrop.wrongPreviewMs') + 50);
    assert.equal(s.extra.previewPiece, null, 'the wrong piece breaks off after syntaxDrop.wrongPreviewMs');
    assert.equal(s.extra.slots.find((y) => y.id === slot).filled, null, 'the slot stays open');
    s = await playSyntaxDrop(page, controller(page, 'syntax-drop', 'act'), lvl);
    assert.equal(s.status, 'won');
    const [r] = await waitNewResult(j, page, 'l1', before);
    assert.ok(r.mistakes.some((m) => m.itemId === decoy && m.concept === lvl.pieces.find((p) => p.id === decoy).concept), `the result lists the mistake on ${decoy}`);
    await step(page, 'won');
  },
});
