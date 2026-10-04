// SPEC §7: AC-112 Forgejo adapter (same contract as GitHub plus login creation), AC-115 secret scan on push.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { loadAdapter, need, settle } from '../lib/adapters.mjs';
import { startFakeForgejo } from '../fixtures/fakes/forgejo.mjs';
import { PLANTED } from '../lib/secrets.mjs';

const ORG = 'tins-practice';
let fj;
before(async () => { fj = await startFakeForgejo({ org: ORG }); });
after(async () => { await fj?.close(); });
const make = async (token) => need(await loadAdapter('forgejo'), 'createForgejoAdapter')({ apiUrl: fj.url, token, org: ORG });

test('AC-112 Forgejo adapter creates the learner login, team membership, repo from template and protection; persona bots cannot merge or push to main', { timeout: 60_000 }, async () => {
  const a = await make('admin-token-test-do-not-use');
  const out = await a.provisionLearner({ username: 'synthetic-learner-2', email: 'learner2@example.invalid', team: 'learners', template: `${ORG}/lab-template`, repo: 'lab-synthetic-learner-2' });
  const user = fj.find('POST', /^\/api\/v1\/admin\/users$/).at(-1);
  assert.ok(user, 'the Forgejo login is created (D-34)');
  assert.equal(user.json?.username, 'synthetic-learner-2');
  assert.equal(user.json?.must_change_password, true, 'the learner must set their own password');
  assert.ok(fj.find('PUT', /^\/api\/v1\/teams\/\d+\/members\/synthetic-learner-2$/).length, 'team membership');
  assert.ok(fj.find('POST', new RegExp(`^/api/v1/repos/${ORG}/lab-template/generate$`)).length, 'repo from template');
  const prot = fj.find('POST', new RegExp(`^/api/v1/repos/${ORG}/lab-synthetic-learner-2/branch_protections$`)).at(-1);
  assert.ok(prot, 'branch protection created');
  assert.ok(/main/.test(prot.json?.branch_name || prot.json?.rule_name || ''), 'protection is on main');
  assert.equal(out?.repo, `${ORG}/lab-synthetic-learner-2`);

  const batchEndsAt = Date.now() + 30 * 86_400_000;
  const tok = await a.personaToken({ username: 'persona-ravi', batchEndsAt, now: Date.now() });
  assert.ok(tok?.token && Number.isFinite(tok.expiresAt) && tok.expiresAt <= batchEndsAt, 'persona token with expiry by batch end');
  const bot = await make(tok.token);
  const repo = `${ORG}/lab-synthetic-learner-2`;
  const pr = await bot.openPullRequest({ repo, branch: 'persona/fix-typo', title: 'Fix typo (persona)' });
  assert.ok(Number.isInteger(pr?.number), 'persona opens a PR');
  assert.ok(fj.find('POST', /\/branches$/).some((r) => r.json?.new_branch_name === 'persona/fix-typo'), 'branch created');
  const merge = await settle(bot.mergePullRequest({ repo, number: pr.number }));
  assert.equal(merge?.ok, false, 'merge refused and reported');
  const push = await settle(bot.writeFile({ repo, branch: 'main', path: 'README.md', content: 'bot' }));
  assert.equal(push?.ok, false, 'write to main refused and reported');
});

test('AC-115 a push with a test credential is blocked with a rotate-this-key message; with secretScan off it passes and the log records who turned it off', { timeout: 60_000 }, async () => {
  const mod = await loadAdapter('forgejo');
  const log = [];
  const guard = need(mod, 'createPushCheck')({ log: (e) => log.push(e) });
  const hook = createServer(guard.handler);
  await new Promise((r) => hook.listen(0, '127.0.0.1', r));
  try {
    const hookUrl = `http://127.0.0.1:${hook.address().port}/push-check`;
    const a = await make('admin-token-test-do-not-use');
    await a.installPushCheck({ repo: `${ORG}/lab-synthetic-learner-2`, hookUrl });
    assert.ok(fj.hooks.get(`${ORG}/lab-synthetic-learner-2`)?.some((h) => h.config?.url === hookUrl), 'push-check hook registered on the repo');
    const push = (files) => fetch(`${fj.url}/__fake/push`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repo: `${ORG}/lab-synthetic-learner-2`, pusher: 'synthetic-learner-2', files }) }).then(async (r) => ({ status: r.status, json: await r.json() }));
    const leaky = [{ path: 'deploy.env', content: `AWS_ACCESS_KEY_ID=${PLANTED.awsKeyId}\n` }];
    const clean = await push([{ path: 'README.md', content: '# hello\n' }]);
    assert.equal(clean.status, 200, 'control: a clean push passes');
    const blocked = await push(leaky);
    assert.equal(blocked.status, 403, 'the push with a credential is blocked');
    assert.match(blocked.json.message, /rotate/i, 'message tells the learner to rotate the key');
    assert.ok(!blocked.json.message.includes(PLANTED.awsKeyId), 'the message never repeats the key (D-28)');

    guard.setSecretScan(false, 'admin1');
    const passed = await push(leaky);
    assert.equal(passed.status, 200, 'with secretScan off the push passes');
    assert.ok(log.some((e) => e.switch === 'secretScan' && e.on === false && e.by === 'admin1'), `log records who turned it off: ${JSON.stringify(log)}`);
    assert.ok(!JSON.stringify(log).includes(PLANTED.awsKeyId), 'the log never holds the key');
  } finally { await new Promise((r) => hook.close(r)); }
});
