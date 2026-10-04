// Fake Google Drive v3: uploads (uploadType=media or multipart) and downloads (?alt=media). Stores and records bytes.
import { startFake, j, nextId } from './common.mjs';

function multipartLast(body, contentType) {
  const b = /boundary=("?)([^";]+)\1/.exec(contentType || '')?.[2];
  if (!b) return { meta: null, data: body };
  const parts = []; const sep = Buffer.from(`--${b}`); let i = body.indexOf(sep);
  while (i !== -1) { const next = body.indexOf(sep, i + sep.length); if (next === -1) break; parts.push(body.subarray(i + sep.length, next)); i = next; }
  const parse = (p) => { const h = p.indexOf('\r\n\r\n'); let d = p.subarray(h + 4); if (d.subarray(-2).toString() === '\r\n') d = d.subarray(0, -2); return { head: p.subarray(0, h).toString(), data: d }; };
  const ps = parts.map(parse);
  let meta = null; try { meta = JSON.parse(ps[0].data.toString()); } catch {}
  return { meta, data: ps[ps.length - 1].data };
}
export async function startFakeDrive() {
  const files = new Map();
  const routes = [
    ['POST', /^\/upload\/drive\/v3\/files$/, (_, c) => {
      const type = c.query.get('uploadType');
      const id = `file-${nextId()}`;
      const { meta, data } = type === 'multipart' ? multipartLast(c.body, c.headers['content-type']) : { meta: null, data: c.body };
      files.set(id, { id, name: meta?.name || id, parents: meta?.parents || [], data: Buffer.from(data) });
      c.rec.uploaded = Buffer.from(data);
      return j(200, { id, name: meta?.name || id });
    }],
    ['GET', /^\/drive\/v3\/files\/([^/]+)$/, (_, c) => { const f = files.get(c.match[1]); if (!f) return j(404, { error: { code: 404 } }); return c.query.get('alt') === 'media' ? { status: 200, body: f.data, headers: { 'content-type': 'application/octet-stream' } } : j(200, { id: f.id, name: f.name }); }],
    ['GET', /^\/drive\/v3\/files$/, (_, c) => { const q = c.query.get('q') || ''; const name = /name\s*=\s*'([^']+)'/.exec(q)?.[1]; return j(200, { files: [...files.values()].filter((f) => !name || f.name === name).map((f) => ({ id: f.id, name: f.name })) }); }],
    ['DELETE', /^\/drive\/v3\/files\/([^/]+)$/, (_, c) => { files.delete(c.match[1]); return { status: 204 }; }],
  ];
  const fake = await startFake(routes, { name: 'fake-drive' });
  fake.files = files;
  fake.uploads = () => fake.requests.filter((r) => r.uploaded).map((r) => r.uploaded);
  return fake;
}
