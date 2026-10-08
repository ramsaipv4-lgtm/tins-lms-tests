// AC-219 The chart renderer draws the fixture calls as SVG with the expected marks: a bar chart with 4 bars and a
// title, a scatter with 10 points, a histogram with bins=5 (games contract §13.T5 renderers: chartSvg(code) in
// packages/games/src/renderers/chart.ts is pure and runs in Node; marks carry data-mark).
// Fixture: acceptance/fixtures/games/charts.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ROOT, FIXTURES } from '../lib/paths.mjs';

const CHART = join(APP_ROOT, 'packages', 'games', 'src', 'renderers', 'chart.ts');
const { cases } = JSON.parse(readFileSync(join(FIXTURES, 'games', 'charts.json'), 'utf8'));
async function chartSvg() {
  if (!existsSync(CHART)) throw new Error(`chart renderer not found: ${CHART} (games contract §13.T5)`);
  const m = await import(pathToFileURL(CHART).href);
  if (typeof m.chartSvg !== 'function' || typeof m.render !== 'function') throw new Error('chart.ts must export chartSvg(code) and render(code, el) (§13.T5)');
  return m.chartSvg;
}
const count = (svg, mark) => (svg.match(new RegExp(`data-mark=["']${mark}["']`, 'g')) || []).length;

for (const c of cases) {
  test(`AC-219 chart ${c.id}: ${Object.entries(c.marks).map(([k, v]) => `${v} ${k}`).join(', ')}`, async () => {
    const svg = (await chartSvg())(c.code);
    assert.equal(typeof svg, 'string', 'chartSvg returns SVG markup');
    assert.match(svg.trim(), /^<svg[\s>]/, 'root element is <svg>');
    for (const [mark, n] of Object.entries(c.marks)) assert.equal(count(svg, mark), n, `data-mark="${mark}" count`);
    if (c.titleText) assert.ok(svg.includes(c.titleText), `the title text "${c.titleText}" is drawn`);
  });
}
