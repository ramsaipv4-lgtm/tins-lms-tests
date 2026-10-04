// Minimal POSIX ustar writer/reader (zero dependencies) for building package uploads and reading exports.
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const enc = new TextEncoder();
function octal(n, len) { return n.toString(8).padStart(len - 1, '0') + '\0'; }
function header(path, size, type = '0') {
  const h = new Uint8Array(512);
  let name = path, prefix = '';
  if (enc.encode(name).length > 100) { const i = path.lastIndexOf('/', 154); prefix = path.slice(0, i); name = path.slice(i + 1); }
  const put = (s, off, len) => h.set(enc.encode(s).slice(0, len), off);
  put(name, 0, 100); put(octal(type === '5' ? 0o755 : 0o644, 8), 100, 8); put(octal(0, 8), 108, 8); put(octal(0, 8), 116, 8);
  put(octal(size, 12), 124, 12); put(octal(1767225600, 12), 136, 12); put('        ', 148, 8); put(type, 156, 1);
  put('ustar\0', 257, 6); put('00', 263, 2); put(prefix, 345, 155);
  let sum = 0; for (const b of h) sum += b;
  put(octal(sum, 7) + ' ', 148, 8);
  return h;
}
/** files: [{path, bytes}] -> Uint8Array (ustar). */
export function pack(files) {
  const parts = [];
  for (const f of files) {
    const b = typeof f.bytes === 'string' ? enc.encode(f.bytes) : f.bytes;
    parts.push(header(f.path, b.length), b);
    const pad = (512 - (b.length % 512)) % 512; if (pad) parts.push(new Uint8Array(pad));
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** Reads every regular file under dir -> [{path, bytes}] with '/'-separated relative paths (sorted). */
export function readTree(dir) {
  if (!existsSync(dir)) throw new Error(`fixture folder not found: ${dir}`);
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push({ path: relative(dir, p).split(sep).join('/'), bytes: new Uint8Array(readFileSync(p)) }); } };
  walk(dir);
  return out;
}
/** ustar (or GNU/pax-tolerant) reader -> [{path, bytes, type}] for regular files and directories. */
export function unpack(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dec = new TextDecoder();
  const str = (o, l) => dec.decode(u8.subarray(o, o + l)).replace(/\0.*$/s, '');
  const out = []; let off = 0; let longName = null; let paxPath = null;
  while (off + 512 <= u8.length) {
    if (u8.subarray(off, off + 512).every((b) => b === 0)) break;
    const size = parseInt(str(off + 124, 12).trim() || '0', 8);
    const type = str(off + 156, 1) || '0';
    const magic = str(off + 257, 6);
    let path = str(off, 100);
    if (magic.startsWith('ustar')) { const pre = str(off + 345, 155); if (pre) path = pre + '/' + path; }
    const data = u8.slice(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = dec.decode(data).replace(/\0.*$/s, ''); continue; }
    if (type === 'x') { const m = dec.decode(data).match(/\d+ path=([^\n]*)\n/); paxPath = m ? m[1] : null; continue; }
    if (type === 'g') continue;
    if (longName) { path = longName; longName = null; }
    if (paxPath) { path = paxPath; paxPath = null; }
    out.push({ path: path.replace(/^\.\//, ''), bytes: data, type: type === '5' ? 'dir' : 'file' });
  }
  return out;
}
