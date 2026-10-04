// Fake GitHub REST + GraphQL (SPEC AC-110, AC-111). Tokens starting with "bot-" are persona-bot tokens:
// they may create branches and PRs but every merge and every write to main is rejected with 403.
import { startFake, j, nextId } from './common.mjs';

export const ACCOUNT_CREATION = [/^\/admin\/users/, /^\/users$/, /^\/user\/signup/, /^\/signup/];

export async function startFakeGithub({ org = 'tins-test-org' } = {}) {
  const isBot = (t) => typeof t === 'string' && t.startsWith('bot-');
  const pulls = new Map(); let prNo = 0;
  const forbid = (msg) => j(403, { message: msg, documentation_url: 'https://docs.github.com/rest' });
  const routes = [
    ['GET', /^\/users\/([^/]+)$/, (_, c) => j(200, { login: c.match[1], id: 5000 + c.match[1].length, type: 'User' })],
    ['POST', /^\/orgs\/([^/]+)\/invitations$/, (_, c) => j(201, { id: nextId(), invitee: c.json?.invitee_id ?? null, email: c.json?.email ?? null, role: c.json?.role || 'direct_member' })],
    ['GET', /^\/orgs\/([^/]+)\/teams\/([^/]+)$/, (_, c) => j(200, { id: 77, slug: c.match[2], name: c.match[2] })],
    ['PUT', /^\/orgs\/([^/]+)\/teams\/([^/]+)\/memberships\/([^/]+)$/, () => j(200, { state: 'pending', role: 'member' })],
    ['POST', /^\/repos\/([^/]+)\/([^/]+)\/generate$/, (_, c) => { const owner = c.json?.owner || org; return j(201, { id: nextId(), name: c.json?.name, full_name: `${owner}/${c.json?.name}`, default_branch: 'main', private: !!c.json?.private }); }],
    ['GET', /^\/repos\/([^/]+)\/([^/]+)$/, (_, c) => j(200, { name: c.match[2], full_name: `${c.match[1]}/${c.match[2]}`, default_branch: 'main' })],
    ['PUT', /^\/repos\/([^/]+)\/([^/]+)\/branches\/([^/]+)\/protection$/, (_, c) => (isBot(c.token) ? forbid('bots cannot change protection') : j(200, { url: c.rec.path, ...c.json }))],
    ['GET', /^\/repos\/([^/]+)\/([^/]+)\/git\/(?:ref|refs)\/heads\/(.+)$/, (_, c) => j(200, { ref: `refs/heads/${c.match[3]}`, object: { sha: 'a'.repeat(40), type: 'commit' } })],
    ['POST', /^\/repos\/([^/]+)\/([^/]+)\/git\/refs$/, (_, c) => (c.json?.ref === 'refs/heads/main' ? j(422, { message: 'Reference already exists' }) : j(201, { ref: c.json?.ref, object: { sha: c.json?.sha } }))],
    ['PATCH', /^\/repos\/([^/]+)\/([^/]+)\/git\/refs\/heads\/main$/, (_, c) => (isBot(c.token) ? forbid('protected branch: main') : j(200, { ref: 'refs/heads/main' }))],
    ['PUT', /^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/, (_, c) => ((isBot(c.token) && (!c.json?.branch || c.json.branch === 'main')) ? forbid('protected branch: main') : j(201, { content: { path: c.match[3] }, commit: { sha: 'b'.repeat(40) } }))],
    ['POST', /^\/repos\/([^/]+)\/([^/]+)\/pulls$/, (_, c) => { const n = ++prNo; pulls.set(n, c.json); return j(201, { number: n, html_url: `https://github.example/${c.match[1]}/${c.match[2]}/pull/${n}`, head: { ref: c.json?.head }, base: { ref: c.json?.base }, state: 'open' }); }],
    ['PUT', /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/merge$/, (_, c) => (isBot(c.token) ? forbid('Resource not accessible by integration') : j(200, { merged: true, sha: 'c'.repeat(40) }))],
    ['POST', /^\/app\/installations\/([^/]+)\/access_tokens$/, (_, c) => j(201, { token: `bot-${c.match[1]}-${nextId()}`, expires_at: new Date(Date.now() + 3600_000).toISOString() })],
    ['POST', /^\/graphql$/, (_, c) => {
      const q = String(c.json?.query || '');
      const data = {};
      if (/organization\s*\(/.test(q)) data.organization = { id: 'O_fake1', login: org };
      if (/\buser\s*\(/.test(q)) data.user = { id: 'U_fake1' };
      if (/createProjectV2\s*\(/.test(q)) data.createProjectV2 = { projectV2: { id: 'PVT_fake1', number: 1, title: c.json?.variables?.title ?? 'project' } };
      if (/createProjectV2Field\s*\(/.test(q)) data.createProjectV2Field = { projectV2Field: { id: 'PVTIF_fake1', name: 'Iteration', dataType: 'ITERATION' } };
      if (/linkProjectV2ToRepository\s*\(/.test(q)) data.linkProjectV2ToRepository = { repository: { id: 'R_fake1' } };
      if (!Object.keys(data).length) return j(200, { errors: [{ message: 'fake GitHub GraphQL: unsupported query' }] });
      return j(200, { data });
    }],
    // Account creation endpoints exist only so the test can prove they are never called.
    ['POST', /^\/admin\/users$/, () => j(201, { login: 'created' })],
  ];
  const fake = await startFake(routes, { name: 'fake-github' });
  fake.graphql = () => fake.requests.filter((r) => r.path === '/graphql').map((r) => ({ query: String(r.json?.query || ''), variables: r.json?.variables || {}, token: r.token }));
  fake.accountCreationCalls = () => fake.requests.filter((r) => ACCOUNT_CREATION.some((re) => re.test(r.path)) && r.method !== 'GET');
  return fake;
}
