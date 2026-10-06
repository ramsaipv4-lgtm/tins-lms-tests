// Starts the app server in test mode (SPEC §2, §5.9) and returns a small client.
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { SERVER_ENTRY, APP_ROOT } from './paths.mjs';

export async function freePort() {
  return new Promise((res, rej) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}

/** start({ testMode = true, env = {} }) -> { url, port, stop, stdout(), request(path, opts), login(personId, roles) } */
export async function start({ testMode = true, env = {}, timeoutMs = 30000 } = {}) {
  if (!existsSync(SERVER_ENTRY)) throw new Error(`server entry not found: ${SERVER_ENTRY} (SPEC §2)`);
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), 'lms-acc-'));
  const childEnv = { ...process.env, PORT: String(port), LMS_PROFILE: 'hub', LMS_DATA_DIR: dataDir, LMS_TLS: 'off', ...env };
  delete childEnv.NODE_TEST_CONTEXT; // a child must not think it is a test-runner child (tins-kit RF-7)
  if (testMode) childEnv.LMS_TEST_MODE = '1'; else delete childEnv.LMS_TEST_MODE;
  const child = spawn(process.execPath, [SERVER_ENTRY], { cwd: APP_ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const add = (d) => { out += d; if (out.length > 1 << 20) out = out.slice(-(1 << 19)); }; // bounded log buffer
  child.stdout.on('data', add);
  child.stderr.on('data', add);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`server did not print LISTENING within ${timeoutMs} ms\n${out}`)), timeoutMs);
    const check = () => { if (out.includes(`LISTENING ${port}`)) { clearTimeout(t); res(); } };
    child.stdout.on('data', check);
    child.on('exit', (code) => { clearTimeout(t); rej(new Error(`server exited (${code})\n${out}`)); });
  });
  const url = `http://127.0.0.1:${port}`;
  let cookie = '';
  async function request(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
    const h = { ...headers }; if (cookie) h.cookie = cookie;
    let payload = body;
    if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string') { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
    const r = await fetch(url + path, { method, body: payload, headers: h, redirect: 'manual' });
    const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    if (raw) return r;
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text, headers: r.headers };
  }
  return {
    url, port, dataDir,
    stdout: () => out,
    request,
    setCookie: (c) => { cookie = c; },
    getCookie: () => cookie,
    async login(personId, roles) { const r = await request('/__test/login', { method: 'POST', body: { personId, roles } }); if (r.status >= 300) throw new Error(`test login failed: ${r.status} ${r.text}`); return r; },
    async stop() { child.kill('SIGTERM'); await new Promise((r) => { child.once('exit', r); setTimeout(r, 3000); }); },
  };
}
