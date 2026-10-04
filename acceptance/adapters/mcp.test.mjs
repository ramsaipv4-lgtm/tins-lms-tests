// SPEC §7: AC-116 the hub's MCP server: read tools are read-only; write tools only return a pending diff (D-31).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useServer, as, setClock, is2xx, expectStatus, TEST_TIMEOUT, T0, MIN } from '../lib/api.mjs';
import { mcpClient } from '../lib/mcp.mjs';

const S = useServer();
const C = 'c1';
const WRITE_TOOLS = ['grade_edit', 'post_message', 'repo_write'];

test('AC-116 MCP tools: everything except grade_edit/post_message/repo_write is read-only; write tools return a pending diff and change nothing', { timeout: TEST_TIMEOUT }, async () => {
  const srv = S();
  await setClock(srv, T0 + 30 * MIN);
  const l1 = await as(srv, 'l1', ['learner']);
  const att = expectStatus(await l1.req(`/api/classes/${C}/attempts`, { method: 'POST', body: { itemId: 'quiz-mcp', mode: 'live', answers: { q1: 'a' }, timing: { hubStart: null, hubEnd: null, monotonicMs: 60000, deviceStart: T0, deviceEnd: T0 + 60000 }, aiUsage: [] } }), is2xx, 'attempt');
  const tr = await as(srv, 'tr1', ['trainer']);
  expectStatus(await tr.req(`/api/classes/${C}/attempts/${encodeURIComponent(att.json.id)}/grade`, { method: 'POST', body: { score: 5 } }), is2xx, 'grade 5');
  const snapshot = async () => (await tr.req(`/db/class-${C}/_all_docs?include_docs=true`)).json.rows.map((r) => r.doc).filter((d) => d && !String(d._id).startsWith('_')).map((d) => `${d._id}@${d._rev}`).sort();
  const before = await snapshot();

  const mcp = mcpClient(`${srv.url}/mcp`, tr.cookie);
  await mcp.init();
  const tools = await mcp.listTools();
  assert.ok(Array.isArray(tools) && tools.length > 0, 'tools/list returns tools');
  const names = tools.map((t) => t.name);
  for (const w of WRITE_TOOLS) assert.ok(names.includes(w), `write tool ${w} exists`);
  for (const t of tools) {
    if (WRITE_TOOLS.includes(t.name)) assert.equal(t.annotations?.readOnlyHint, false, `${t.name} is marked as a write tool`);
    else assert.equal(t.annotations?.readOnlyHint, true, `${t.name} is read-only (annotations.readOnlyHint)`);
  }
  const calls = {
    grade_edit: { classId: C, attemptId: att.json.id, score: 9, reason: 'AI suggestion (test)' },
    post_message: { classId: C, to: ['l1', 'l2'], text: 'Synthetic announcement from the AI (test).' },
    repo_write: { repo: 'tins-practice/lab-synthetic', branch: 'main', path: 'README.md', content: 'AI edit (test)' },
  };
  for (const [name, args] of Object.entries(calls)) {
    const r = await mcp.call(name, args);
    const sc = r?.structuredContent;
    assert.equal(sc?.status, 'pending', `${name} returns status pending, got ${JSON.stringify(r).slice(0, 300)}`);
    assert.ok(sc.diff !== undefined && sc.diff !== null && sc.diff !== '', `${name} returns a diff`);
    assert.ok(sc.pendingId, `${name} returns a pendingId for a person to confirm`);
  }
  const after = await snapshot();
  const added = after.filter((x) => !before.includes(x) && !/^(pending|aiPending|aiProposal)/i.test(x));
  assert.deepEqual(added, [], 'no class document (grade ledger, message) changed before a person confirms');
});
