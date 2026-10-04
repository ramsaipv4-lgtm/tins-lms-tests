// Helpers for the synthetic course package (acceptance/fixtures/package, see its FIXTURE.md).
// loadPackageFiles: folder -> { 'relative/posix/path': text }.
// toV11Layout: the same package with day companions moved into the track root (SPEC §4.29, v1.1).
// plantedDefects: one copy of the package per gate check, each with exactly one planted defect (AC-52).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES } from '../../lib/paths.mjs';

export const PACKAGE_DIR = join(FIXTURES, 'package');

/** Reads every file under `dir` as UTF-8 text, keyed by its posix path relative to `dir` (sorted). */
export function loadPackageFiles(dir = PACKAGE_DIR) {
  const out = {};
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs).sort()) {
      const a = join(abs, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(a).isDirectory()) walk(a, r);
      else out[r] = readFileSync(a, 'utf8');
    }
  };
  walk(dir, '');
  return out;
}

const COMPANION = /^(.+)\/day(\d+)\/((?:student_guide|memory_recall|whiteboard|live_coding)_day\d+\.md)$/;

/**
 * v1.1 layout: companion files (`student_guide_dayNN.md`, `memory_recall_dayNN.md`, and whiteboard /
 * live-coding companions if present) sit in the track root instead of `dayN/`. README file tables are
 * updated to match, so the moved package has no README drift either.
 */
export function toV11Layout(files) {
  const out = { ...files };
  const moved = [];
  for (const p of Object.keys(files)) {
    const m = COMPANION.exec(p);
    if (!m) continue;
    const [, track, day, name] = m;
    const to = `${track}/${name}`;
    out[to] = files[p];
    delete out[p];
    moved.push({ track, day, name });
  }
  for (const { track, day, name } of moved) {
    const dayReadme = `${track}/day${day}/README.md`;
    if (out[dayReadme]) out[dayReadme] = out[dayReadme].split('\n').filter((l) => !l.includes(`\`${name}\``)).join('\n');
    const trackReadme = `${track}/README.md`;
    if (out[trackReadme]) {
      const lines = out[trackReadme].split('\n');
      let last = -1;
      lines.forEach((l, i) => { if (l.startsWith('| `')) last = i; });
      lines.splice(last + 1, 0, `| \`${name}\` | Day ${day} companion |`);
      out[trackReadme] = lines.join('\n');
    }
  }
  return out;
}

function edit(files, path, fn) {
  if (!(path in files)) throw new Error(`fixture changed: ${path} not found`);
  const before = files[path];
  const after = fn(before);
  if (after === before) throw new Error(`fixture changed: planted defect did not apply to ${path}`);
  return { ...files, [path]: after };
}
function removeFile(files, path) {
  if (!(path in files)) throw new Error(`fixture changed: ${path} not found`);
  const out = { ...files };
  delete out[path];
  return out;
}
const dropReadmeRow = (name) => (s) => s.split('\n').filter((l) => !l.includes(`\`${name}\``)).join('\n');

/**
 * Returns { 'G1-files': files, ..., 'G8-cards': files }: each value is the package with exactly one
 * planted defect that should fail only that check (AC-52).
 */
export function plantedDefects(files) {
  const d = {};
  // G1: a required file is missing (README row removed too, so G2 stays clean; nothing links to it).
  d['G1-files'] = edit(removeFile(files, 'track1/day1/printable_handout.md'), 'track1/day1/README.md', dropReadmeRow('printable_handout.md'));
  // G2: README still lists a file that was removed (an optional companion, so G1 and G8 stay clean).
  d['G2-readme'] = removeFile(files, 'track1/day2/memory_recall_day02.md');
  // G3: the diagnostic has only 7 questions (question 8 removed; the answer key is untouched).
  d['G3-diagnostic'] = edit(files, 'track1/day1/quicklearn.md', (s) => s.replace(/\n8\. Which key sets the order of pages in a menu\?/, ''));
  // G4: the timed sections add up to 50% of the script's own total runtime.
  d['G4-script-times'] = edit(files, 'track1/day0/instructor_script.md', (s) => s.replace('Total runtime: **2.5 hours**', 'Total runtime: **5 hours**'));
  // G5: a relative link to a file that does not exist.
  d['G5-links'] = edit(files, 'track1/day0/deepdive.md', (s) => s.replace('## What happened', 'See the [missing notes](missing-notes.md).\n\n## What happened'));
  // G6: a fenced code block without a language tag.
  d['G6-code-lang'] = edit(files, 'track1/day2/printable_handout.md', (s) => s.replace('```bash', '```'));
  // G7: the Shift pack's tickets have no checks.
  d['G7-graded'] = edit(files, 'track1/shift/shift-pack-1.json', (s) => {
    const pack = JSON.parse(s);
    for (const t of pack.tickets) delete t.check;
    return JSON.stringify(pack, null, 2) + '\n';
  });
  // G8: a memory-recall exercise without its answer (card without a back).
  d['G8-cards'] = edit(files, 'track1/day0/memory_recall_day00.md', (s) =>
    s.replace('**The answer (check after):** pages for sources, themes for templates, public for build output.\n', ''));
  return d;
}

export const GATE_CHECK_IDS = ['G1-files', 'G2-readme', 'G3-diagnostic', 'G4-script-times', 'G5-links', 'G6-code-lang', 'G7-graded', 'G8-cards'];
