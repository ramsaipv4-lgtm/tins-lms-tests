// Minimal PDF reader for the AC-97 "notebook ruling" check. Not a test file.
//
// How the check works (keep it robust, explainable, and dependency-free):
// 1. Parse every "n g obj … endobj" in the file, including objects packed in compressed object streams
//    (/Type /ObjStm, as pdf-lib and others write them). Inflate /FlateDecode streams with node:zlib.
// 2. Find page 1: the catalog's /Pages tree, first /Kids leaf with /Type /Page.
// 3. Take page 1's content stream(s) plus any Form XObjects it draws with "Do" (one level deep).
// 4. Scan the operators: "x y m … x2 y2 l" segments and thin "x y w h re" rectangles (|h| <= 2), tracking
//    "cm" scale factors approximately (translation/scale only).
// 5. Ruling = at least 15 horizontal segments, each at least 50% of the page width, at distinct y values,
//    whose gaps between neighbours are regular (median absolute deviation of the gaps <= 15% of the median
//    gap). This fails a plain page, a page with a few boxes, and a ruling rendered only as a raster image
//    (SPEC gap: the ruling must be drawn as vector lines).
import { inflateSync } from 'node:zlib';

const latin = (b) => Buffer.from(b).toString('latin1');

export function parsePdf(bytes) {
  const buf = Buffer.from(bytes);
  if (latin(buf.subarray(0, 5)) !== '%PDF-') throw new Error('not a PDF (no %PDF- header)');
  const s = latin(buf);
  const objs = new Map(); // num -> { dict: string, stream: Buffer|null }
  const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = re.exec(s))) {
    const startBody = m.index + m[0].length;
    const end = s.indexOf('endobj', startBody);
    if (end < 0) break;
    const body = s.slice(startBody, end);
    const si = body.search(/\bstream\r?\n/);
    let dict = body; let stream = null;
    if (si >= 0) {
      dict = body.slice(0, si);
      const dataStart = startBody + si + body.slice(si).match(/^stream\r?\n/)[0].length;
      const lenM = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dict);
      let dataEnd = s.indexOf('endstream', dataStart);
      if (lenM && !lenM[2]) dataEnd = Math.min(dataEnd, dataStart + Number(lenM[1]));
      stream = buf.subarray(dataStart, dataEnd);
    }
    objs.set(Number(m[1]), { dict, stream });
    re.lastIndex = end;
  }
  const decode = (o) => {
    if (!o.stream) return Buffer.alloc(0);
    if (/\/FlateDecode/.test(o.dict)) { try { return inflateSync(o.stream); } catch { try { return inflateSync(o.stream, { finishFlush: 2 }); } catch { return Buffer.alloc(0); } } }
    return o.stream;
  };
  // Unpack object streams.
  for (const [, o] of [...objs]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const n = Number(/\/N\s+(\d+)/.exec(o.dict)?.[1] || 0); const first = Number(/\/First\s+(\d+)/.exec(o.dict)?.[1] || 0);
    const data = latin(decode(o));
    const head = data.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = head[2 * i]; const off = head[2 * i + 1]; const next = i + 1 < n ? head[2 * i + 3] : data.length - first;
      if (!objs.has(num)) objs.set(num, { dict: data.slice(first + off, first + next), stream: null });
    }
  }
  return { objs, decode, text: s };
}

const ref = (dict, key) => { const m = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dict); return m ? Number(m[1]) : null; };

export function firstPage(pdf) {
  const { objs, text } = pdf;
  let root = /\/Root\s+(\d+)\s+\d+\s+R/.exec(text)?.[1];
  let catalog = root && objs.get(Number(root));
  if (!catalog || !/\/Type\s*\/Catalog/.test(catalog.dict)) catalog = [...objs.values()].find((o) => /\/Type\s*\/Catalog/.test(o.dict));
  if (!catalog) throw new Error('PDF has no catalog');
  let node = objs.get(ref(catalog.dict, 'Pages'));
  for (let depth = 0; node && depth < 20; depth++) {
    if (/\/Type\s*\/Page\b(?!s)/.test(node.dict)) return node;
    const kids = /\/Kids\s*\[\s*(\d+)\s+\d+\s+R/.exec(node.dict);
    node = kids && objs.get(Number(kids[1]));
  }
  throw new Error('PDF page tree has no first page');
}

function resolveDict(pdf, dict, key) {
  const r = ref(dict, key); if (r != null) return pdf.objs.get(r)?.dict || '';
  const i = dict.indexOf(`/${key}`); if (i < 0) return '';
  let j = dict.indexOf('<<', i); if (j < 0) return '';
  let depth = 0; let k = j;
  for (; k < dict.length; k++) { if (dict.startsWith('<<', k)) { depth++; k++; } else if (dict.startsWith('>>', k)) { depth--; k++; if (!depth) break; } }
  return dict.slice(j, k + 1);
}

/** Content streams (decoded text) of page 1, with its Form XObjects appended. Returns { content, width }. */
export function pageContent(pdf, page) {
  const mb = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/.exec(page.dict) || /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/.exec(pdf.text);
  const width = mb ? Number(mb[3]) - Number(mb[1]) : 595;
  const parts = [];
  const arr = /\/Contents\s*\[([^\]]*)\]/.exec(page.dict);
  const nums = arr ? [...arr[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((x) => Number(x[1])) : [ref(page.dict, 'Contents')].filter((x) => x != null);
  for (const n of nums) { const o = pdf.objs.get(n); if (o) parts.push(latin(pdf.decode(o))); }
  const xobjs = resolveDict(pdf, resolveDict(pdf, page.dict, 'Resources') || '', 'XObject');
  for (const m of xobjs.matchAll(/\/(\S+?)\s+(\d+)\s+\d+\s+R/g)) {
    const o = pdf.objs.get(Number(m[2]));
    if (o && /\/Subtype\s*\/Form/.test(o.dict) && parts.join('').includes(`/${m[1]}`)) parts.push(latin(pdf.decode(o)));
  }
  return { content: parts.join('\n'), width };
}

/** Horizontal segments in a content stream: [{ y, len }] in (approximate) page units. */
export function horizontalSegments(content) {
  const toks = content.replace(/\((?:\\.|[^\\)])*\)/g, ' ').split(/[\s\[\]<>]+/).filter(Boolean);
  const st = []; const segs = []; let cur = null; let sx = 1; let sy = 1; let tx = 0; let ty = 0; const stack = [];
  const num = (i) => Number(st[st.length - i]);
  for (const t of toks) {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) { st.push(t); continue; }
    switch (t) {
      case 'q': stack.push([sx, sy, tx, ty]); break;
      case 'Q': if (stack.length) [sx, sy, tx, ty] = stack.pop(); break;
      case 'cm': { const a = num(6), d = num(3), e = num(2), f = num(1); tx += e * sx; ty += f * sy; sx *= a || 1; sy *= d || 1; break; }
      case 'm': cur = { x: num(2) * sx + tx, y: num(1) * sy + ty }; break;
      case 'l': { const x = num(2) * sx + tx, y = num(1) * sy + ty; if (cur && Math.abs(y - cur.y) < 0.5) segs.push({ y, len: Math.abs(x - cur.x) }); cur = { x, y }; break; }
      case 're': { const w = num(2) * sx, h = num(1) * sy; if (Math.abs(h) <= 2 && Math.abs(w) > 0) segs.push({ y: num(3) * sy + ty, len: Math.abs(w) }); break; }
      default: break;
    }
    st.length = 0;
  }
  return segs;
}

/** Returns { ok, lines, reason } for "page 1 has notebook ruling". */
export function hasNotebookRuling(bytes) {
  const pdf = parsePdf(bytes);
  const { content, width } = pageContent(pdf, firstPage(pdf));
  const segs = horizontalSegments(content).filter((s) => s.len >= 0.5 * width);
  const ys = [...new Set(segs.map((s) => Math.round(s.y * 2) / 2))].sort((a, b) => a - b);
  if (ys.length < 15) return { ok: false, lines: ys.length, reason: `only ${ys.length} full-width horizontal lines on page 1 (need >= 15)` };
  const gaps = ys.slice(1).map((y, i) => y - ys[i]);
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const g = med(gaps); const mad = med(gaps.map((x) => Math.abs(x - g)));
  if (!(g > 0) || mad > 0.15 * g) return { ok: false, lines: ys.length, reason: `line spacing is irregular (median gap ${g}, deviation ${mad})` };
  return { ok: true, lines: ys.length, gap: g };
}
