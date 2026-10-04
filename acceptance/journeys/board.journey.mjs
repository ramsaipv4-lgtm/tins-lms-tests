// AC-97 Board (SPEC §6, D-7, D-36).
// data-testids used: app-ready*, board, board-export-pdf, toolbar-rectangle and toolbar-text (Excalidraw's own
//   testids, kept by the fork; keyboard shortcuts R / T are the fallback)
// Accessible names used: nav /board/; button /add page|new page/.
// Checks:
// - Drawing a rectangle, text, and dropping fixtures/journeys/flow.mmd each change the board's static canvas
//   (pixel hash of the largest <canvas> inside data-testid="board", read with getImageData).
// - "Canvas background stays plain": on the new page before drawing, >= 99% of canvas pixels share one colour;
//   after drawing and after the export, the bottom-right 15% corner (nothing is drawn there) is still >= 99% one colour.
// - "First page has the notebook ruling": the exported PDF's page 1 has >= 15 regularly spaced full-width
//   horizontal vector lines (see _pdf.mjs for the exact rule; a raster-only ruling does not count).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { journey, see, tid, nav, click, download, until, step, at, P, JFIX, assert } from './_harness.mjs';
import { hasNotebookRuling } from './_pdf.mjs';

function canvasStats([fx0, fy0, fx1, fy1]) {
  const root = document.querySelector('[data-testid="board"]');
  const all = [...root.querySelectorAll('canvas')];
  const c = all.find((x) => x.classList.contains('static')) || all.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!c) return null;
  const ctx = c.getContext('2d');
  const x0 = Math.floor(c.width * fx0), y0 = Math.floor(c.height * fy0), w = Math.max(1, Math.floor(c.width * (fx1 - fx0))), h = Math.max(1, Math.floor(c.height * (fy1 - fy0)));
  const d = ctx.getImageData(x0, y0, w, h).data;
  const counts = new Map(); let hash = 0; let n = 0;
  for (let i = 0; i < d.length; i += 16) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; counts.set(k, (counts.get(k) || 0) + 1); hash = (hash * 31 + k + d[i + 3]) | 0; n++; }
  return { dominant: Math.max(...counts.values()) / n, hash };
}

journey({
  name: 'board', acs: ['AC-97'], title: 'trainer adds a page, draws a rectangle and text, drops the .mmd, exports a PDF with ruling on page 1 while the canvas stays plain',
  clock: at(0, '10:00'),
  async run(j) {
    const page = await j.actor('trainer', P.trainer);
    await nav(page, /^(board|whiteboard|open board)$/i, 'board');
    const board = await see(tid(page, 'board'), 'board', 30_000);
    await see(board.locator('canvas'), 'board canvas', 30_000);
    await click(page, /add page|new page/i, 'add page');
    await page.waitForTimeout(500);
    const whole = await page.evaluate(canvasStats, [0, 0, 1, 1]);
    assert.ok(whole, 'a <canvas> inside data-testid="board"');
    assert.ok(whole.dominant >= 0.99, `empty board page background should be plain (one colour on >= 99% of pixels, got ${(whole.dominant * 100).toFixed(1)}%)`);
    await step(page, 'new page');

    const box = await board.boundingBox();
    const pt = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
    const changed = async (before, what) => until(async () => (await page.evaluate(canvasStats, [0, 0, 1, 1])).hash !== before, `${what} to change the canvas`, 10_000, 200);
    const tool = async (id, key) => { const t = page.getByTestId(id); if (await t.count() && await t.first().isVisible()) await t.first().click(); else await page.keyboard.press(key); };

    let h = whole.hash;
    await tool('toolbar-rectangle', 'r');
    await page.mouse.move(...pt(0.2, 0.25)); await page.mouse.down(); await page.mouse.move(...pt(0.35, 0.4), { steps: 8 }); await page.mouse.up();
    await page.keyboard.press('Escape');
    await changed(h, 'drawing a rectangle'); h = (await page.evaluate(canvasStats, [0, 0, 1, 1])).hash;
    await step(page, 'rectangle');

    await tool('toolbar-text', 't');
    await page.mouse.click(...pt(0.2, 0.55));
    await page.keyboard.type('Build pipeline');
    await page.keyboard.press('Escape');
    await changed(h, 'adding text'); h = (await page.evaluate(canvasStats, [0, 0, 1, 1])).hash;
    await step(page, 'text');

    const mmd = readFileSync(join(JFIX, 'flow.mmd'), 'utf8');
    const [cx, cy] = pt(0.45, 0.45);
    await page.evaluate(({ text, x, y }) => {
      const target = document.elementFromPoint(x, y) || document.querySelector('[data-testid="board"]');
      const dt = new DataTransfer(); dt.items.add(new File([text], 'flow.mmd', { type: 'text/plain' }));
      for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }, { text: mmd, x: cx, y: cy });
    await changed(h, 'dropping flow.mmd (Mermaid diagram)');
    await step(page, 'mermaid dropped');

    const corner = [0.85, 0.85, 1, 1];
    const c1 = await page.evaluate(canvasStats, corner);
    assert.ok(c1.dominant >= 0.99, `canvas background must stay plain after drawing (corner ${(c1.dominant * 100).toFixed(1)}% one colour)`);
    const pdf = await download(page, tid(page, 'board-export-pdf'), 'board-export-pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString('latin1'), '%PDF-', 'the export is a PDF');
    const ruling = hasNotebookRuling(pdf.bytes);
    assert.ok(ruling.ok, `PDF page 1 should have the notebook ruling: ${ruling.reason}`);
    const c2 = await page.evaluate(canvasStats, corner);
    assert.ok(c2.dominant >= 0.99, 'canvas background must stay plain after exporting');
    await step(page, 'exported');
  },
});
