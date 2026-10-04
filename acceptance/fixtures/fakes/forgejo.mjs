// Fake Forgejo API v1 (SPEC AC-112, AC-115). Bot tokens ("bot-...") cannot merge or write to main.
// POST /__fake/push { repo: "owner/name", pusher, files: [{path, content}] } simulates a git push: the fake
// calls every pre-receive hook registered for that repo (POST JSON to its config.url) and refuses the push
// when a hook answers { allowed: false, message }.
import { startFake, j, nextId } from './common.mjs';

export async function startFakeForgejo({ org = 'tins-practice' } = {}) {
  const isBot = (t) => typeof t === 'string' && t.startsWith('bot-');
  const users = new Map(); const hooks = new Map(); let prNo = 0;
  const forbid = (m) => j(403, { message: m });
  const P = '/api/v1';
  const re = (s) => new RegExp('^' + P.replace(/\//g, '\\/') + s + '$');
  const routes = [
    ['POST', re('/admin/users'), (_, c) => { const u = c.json || {}; if (!u.username) return j(422, { message: 'username required' }); if (users.has(u.username)) return j(422, { message: 'user already exists' }); users.set(u.username, { id: nextId(), login: u.username, email: u.email }); return j(201, users.get(u.username)); }],
    ['GET', re('/users/([^/]+)'), (_, c) => (users.has(c.match[1]) ? j(200, users.get(c.match[1])) : j(404, { message: 'user does not exist' }))],
    ['GET', re('/orgs/([^/]+)/teams'), () => j(200, [{ id: 11, name: 'learners' }, { id: 12, name: 'personas' }])],
    ['GET', re('/orgs/([^/]+)/teams/search'), () => j(200, { ok: true, data: [{ id: 11, name: 'learners' }, { id: 12, name: 'personas' }] })],
    ['PUT', re('/teams/(\\d+)/members/([^/]+)'), () => ({ status: 204 })],
    ['POST', re('/repos/([^/]+)/([^/]+)/generate'), (_, c) => j(201, { id: nextId(), name: c.json?.name, full_name: `${c.json?.owner || org}/${c.json?.name}`, default_branch: 'main' })],
    ['GET', re('/repos/([^/]+)/([^/]+)'), (_, c) => j(200, { name: c.match[2], full_name: `${c.match[1]}/${c.match[2]}`, default_branch: 'main' })],
    ['POST', re('/repos/([^/]+)/([^/]+)/branch_protections'), (_, c) => (isBot(c.token) ? forbid('bots cannot change protection') : j(201, { ...c.json }))],
    ['POST', re('/repos/([^/]+)/([^/]+)/branches'), (_, c) => (c.json?.new_branch_name === 'main' ? j(409, { message: 'branch exists' }) : j(201, { name: c.json?.new_branch_name }))],
    ['POST', re('/repos/([^/]+)/([^/]+)/contents/(.+)'), (_, c) => ((isBot(c.token) && (!c.json?.branch || c.json.branch === 'main')) ? forbid('protected branch: main') : j(201, { content: { path: c.match[3] } }))],
    ['PUT', re('/repos/([^/]+)/([^/]+)/contents/(.+)'), (_, c) => ((isBot(c.token) && (!c.json?.branch || c.json.branch === 'main')) ? forbid('protected branch: main') : j(200, { content: { path: c.match[3] } }))],
    ['POST', re('/repos/([^/]+)/([^/]+)/pulls'), (_, c) => j(201, { number: ++prNo, head: { ref: c.json?.head }, base: { ref: c.json?.base }, state: 'open' })],
    ['POST', re('/repos/([^/]+)/([^/]+)/pulls/(\\d+)/merge'), (_, c) => (isBot(c.token) ? forbid('user not allowed to merge') : j(200, {}))],
    ['POST', re('/repos/([^/]+)/([^/]+)/hooks'), (_, c) => { const k = `${c.match[1]}/${c.match[2]}`; const h = { id: nextId(), ...c.json }; hooks.set(k, [...(hooks.get(k) || []), h]); return j(201, h); }],
    ['POST', re('/users/([^/]+)/tokens'), (_, c) => j(201, { id: nextId(), name: c.json?.name, sha1: `bot-${c.match[1]}-${nextId()}`, scopes: c.json?.scopes || [] })],
    ['POST', /^\/__fake\/push$/, async (_, c) => {
      const { repo, pusher, files } = c.json || {};
      for (const h of hooks.get(repo) || []) {
        const url = h.config?.url; if (!url) continue;
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repository: repo, pusher, files }) });
        let v = null; try { v = await r.json(); } catch {}
        if (!v || v.allowed !== true) return j(403, { accepted: false, message: v?.message || `pre-receive hook declined (${r.status})` });
      }
      return j(200, { accepted: true });
    }],
  ];
  const fake = await startFake(routes, { name: 'fake-forgejo' });
  fake.users = users; fake.hooks = hooks;
  return fake;
}
