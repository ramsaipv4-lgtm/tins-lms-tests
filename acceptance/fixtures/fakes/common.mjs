// Tiny zero-dependency fake HTTP server base: records every request, routes by method + regex.
import { createServer } from 'node:http';

/**
 * startFake(routes, { name }) -> { url, port, requests, close(), find(method, re) }
 * routes: [[method, RegExp, (req, ctx) => { status, json?, body?, headers? } | Promise<...>]]
 * ctx: { match, query (URLSearchParams), body (Buffer), json (parsed or null), headers, token, rec }
 */
export async function startFake(routes, { name = 'fake' } = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const u = new URL(req.url, 'http://x');
    let json = null; try { json = body.length ? JSON.parse(body.toString('utf8')) : null; } catch {}
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^(Bearer|token)\s+/i, '') || null;
    const rec = { method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: req.headers, body, json, token, status: 0 };
    requests.push(rec);
    let out = { status: 404, json: { message: `${name}: no route for ${req.method} ${u.pathname}` } };
    for (const [m, re, fn] of routes) {
      if (m !== req.method && m !== '*') continue;
      const match = u.pathname.match(re); if (!match) continue;
      try { out = await fn(req, { match, query: u.searchParams, body, json, headers: req.headers, token, rec }); }
      catch (e) { out = { status: 500, json: { message: String(e?.message || e) } }; }
      break;
    }
    rec.status = out.status;
    const headers = { ...(out.headers || {}) };
    let payload = out.body;
    if (out.json !== undefined) { payload = JSON.stringify(out.json); headers['content-type'] ??= 'application/json'; }
    res.writeHead(out.status, headers); res.end(payload ?? '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`, port, requests,
    find: (method, re) => requests.filter((r) => (method === '*' || r.method === method) && re.test(r.path)),
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
export const j = (status, json, headers) => ({ status, json, headers });
let idSeq = 1000;
export const nextId = () => ++idSeq;
