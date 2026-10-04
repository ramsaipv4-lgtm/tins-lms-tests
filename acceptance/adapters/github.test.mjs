// SPEC §7: AC-110 GitHub App provisioning, AC-111 persona bots (fake GitHub; surface in CONTRACT.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapter, need, settle } from '../lib/adapters.mjs';
import { startFakeGithub } from '../fixtures/fakes/github.mjs';

const ORG = 'tins-test-org';
let gh;
before(async () => { gh = await startFakeGithub({ org: ORG }); });
after(async () => { await gh?.close(); });
const make = async (token) => need(await loadAdapter('github'), 'createGithubAdapter')({ apiUrl: gh.url, graphqlUrl: `${gh.url}/graphql`, token, org: ORG });

test('AC-110 GitHub adapter: invite, team membership, repo from template, main protection and an iteration project; never creates accounts', { timeout: 60_000 }, async () => {
  const a = await make('app-token-test-do-not-use');
  const start = gh.requests.length;
  const out = await a.provisionLearner({ username: 'synthetic-learner-1', team: 'batch-test', template: `${ORG}/lab-template`, repo: 'lab-synthetic-learner-1', projectTitle: 'Sprint board (test)' });
  const reqs = gh.requests.slice(start);
  const one = (m, re, what) => { const r = reqs.filter((x) => x.method === m && re.test(x.path)); assert.ok(r.length >= 1, `${what}: expected ${m} ${re}; saw ${reqs.map((x) => `${x.method} ${x.path}`).join(', ')}`); return r[r.length - 1]; };
  const inv = one('POST', new RegExp(`^/orgs/${ORG}/invitations$`), 'org invite');
  assert.ok(inv.json?.invitee_id || inv.json?.email, 'invite names the user');
  one('PUT', new RegExp(`^/orgs/${ORG}/teams/batch-test/memberships/synthetic-learner-1$`), 'team membership');
  const gen = one('POST', new RegExp(`^/repos/${ORG}/lab-template/generate$`), 'repo from template');
  assert.equal(gen.json?.name, 'lab-synthetic-learner-1');
  const prot = one('PUT', new RegExp(`^/repos/${ORG}/lab-synthetic-learner-1/branches/main/protection$`), 'branch protection on main');
  assert.equal(prot.json?.allow_force_pushes, false, 'no force-push');
  assert.ok(prot.json?.required_pull_request_reviews && typeof prot.json.required_pull_request_reviews === 'object', 'PR required');
  const gql = gh.graphql();
  assert.ok(gql.some((g) => /createProjectV2\s*\(/.test(g.query)), 'a ProjectV2 is created');
  assert.ok(gql.some((g) => /createProjectV2Field\s*\(/.test(g.query) && /ITERATION/.test(g.query + JSON.stringify(g.variables))), 'the project gets an iteration field');
  assert.deepEqual(gh.accountCreationCalls(), [], 'no account-creation endpoint was called');
  assert.equal(out?.repo, `${ORG}/lab-synthetic-learner-1`);
  assert.ok(out?.projectId, 'result has the project id');
});

test('AC-111 persona bot opens a branch and PR; it cannot merge or push to main (reported); its token expires by batch end', { timeout: 60_000 }, async () => {
  const app = await make('app-token-test-do-not-use');
  const batchEndsAt = Date.now() + 30 * 86_400_000;
  const tok = await app.personaToken({ installationId: 'persona-ravi', batchEndsAt, now: Date.now() });
  assert.ok(typeof tok?.token === 'string' && tok.token.length > 0, 'persona token issued');
  assert.ok(Number.isFinite(tok.expiresAt) && tok.expiresAt <= batchEndsAt && tok.expiresAt > Date.now(), 'token carries an expiry no later than batch end');
  const late = await settle(app.personaToken({ installationId: 'persona-ravi', batchEndsAt, now: batchEndsAt + 1 }));
  assert.equal(late?.ok === false || late?.thrown === true, true, 'no persona token after batch end');

  const bot = await make(tok.token);
  const repo = `${ORG}/lab-synthetic-learner-1`;
  const start = gh.requests.length;
  const pr = await bot.openPullRequest({ repo, branch: 'persona/add-healthcheck', title: 'Add health check (persona)' });
  assert.ok(Number.isInteger(pr?.number), 'PR opened');
  const reqs = gh.requests.slice(start);
  assert.ok(reqs.some((r) => r.method === 'POST' && /\/git\/refs$/.test(r.path) && r.json?.ref === 'refs/heads/persona/add-healthcheck'), 'branch created');
  assert.ok(reqs.some((r) => r.method === 'POST' && /\/pulls$/.test(r.path) && r.json?.base === 'main'), 'PR against main');

  const merge = await settle(bot.mergePullRequest({ repo, number: pr.number }));
  assert.equal(merge?.ok, false, 'merge is reported as refused');
  assert.ok(gh.requests.some((r) => r.method === 'PUT' && /\/merge$/.test(r.path) && r.status === 403), 'the fake refused the bot merge');
  const push = await settle(bot.writeFile({ repo, branch: 'main', path: 'README.md', content: 'bot write' }));
  assert.equal(push?.ok, false, 'a bot write to main is reported as refused');
  const ok = await settle(bot.writeFile({ repo, branch: 'persona/add-healthcheck', path: 'health.txt', content: 'ok' }));
  assert.notEqual(ok?.ok, false, 'control: a bot write to its own branch works');
});
