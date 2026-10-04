// Minimal MCP client over Streamable HTTP (JSON-RPC 2.0), using a session cookie (AC-116).
export function mcpClient(url, cookie) {
  let id = 0; let sessionId = null;
  async function rpc(method, params, notify = false) {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', cookie };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const body = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params };
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    sessionId = r.headers.get('mcp-session-id') || sessionId;
    if (notify) { await r.arrayBuffer(); return null; }
    const text = await r.text();
    if (r.status >= 300) throw new Error(`MCP ${method}: HTTP ${r.status} ${text.slice(0, 300)}`);
    let msg;
    if ((r.headers.get('content-type') || '').includes('text/event-stream')) {
      const datas = text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean).map((d) => JSON.parse(d));
      msg = datas.find((d) => d.id === body.id) ?? datas.at(-1);
    } else msg = JSON.parse(text);
    if (msg?.error) throw new Error(`MCP ${method}: ${JSON.stringify(msg.error)}`);
    return msg?.result;
  }
  return {
    rpc,
    async init() {
      const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'tins-lms-acceptance', version: '1' } });
      await rpc('notifications/initialized', {}, true);
      return r;
    },
    listTools: async () => (await rpc('tools/list', {})).tools,
    call: (name, args) => rpc('tools/call', { name, arguments: args }),
  };
}
