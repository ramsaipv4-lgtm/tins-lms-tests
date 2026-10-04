// Fake Google Calendar v3, Forms v1 and Meet v2 on one port (SPEC AC-114).
import { startFake, j, nextId } from './common.mjs';

export async function startFakeGoogle() {
  const forms = new Map(); const events = new Map();
  const routes = [
    ['POST', /^\/v2\/spaces$/, () => { const code = `abc-${String(nextId()).slice(-4)}-xyz`; return j(200, { name: `spaces/${code}`, meetingUri: `https://meet.google.com/${code}`, meetingCode: code }); }],
    ['POST', /^\/calendar\/v3\/calendars\/([^/]+)\/events$/, (_, c) => { const id = `ev${nextId()}`; events.set(id, c.json); return j(200, { id, status: 'confirmed', htmlLink: `https://calendar.example/event?eid=${id}`, ...c.json }); }],
    ['PUT', /^\/calendar\/v3\/calendars\/([^/]+)\/events\/([^/]+)$/, (_, c) => { events.set(c.match[2], c.json); return j(200, { id: c.match[2], ...c.json }); }],
    ['PATCH', /^\/calendar\/v3\/calendars\/([^/]+)\/events\/([^/]+)$/, (_, c) => { events.set(c.match[2], { ...events.get(c.match[2]), ...c.json }); return j(200, { id: c.match[2], ...events.get(c.match[2]) }); }],
    ['GET', /^\/calendar\/v3\/calendars\/([^/]+)\/events$/, () => j(200, { items: [...events.entries()].map(([id, e]) => ({ id, ...e })) })],
    ['POST', /^\/v1\/forms$/, (_, c) => { const formId = `form${nextId()}`; forms.set(formId, { info: c.json?.info, items: [], published: false }); return j(200, { formId, info: c.json?.info, responderUri: `https://docs.example/forms/${formId}/viewform`, publishSettings: { publishState: { isPublished: false, isAcceptingResponses: false } } }); }],
    ['POST', /^\/v1\/forms\/([^/:]+):batchUpdate$/, (_, c) => { const f = forms.get(c.match[1]); if (!f) return j(404, { error: { code: 404 } }); for (const r of c.json?.requests || []) if (r.createItem) f.items.push(r.createItem.item); return j(200, { replies: (c.json?.requests || []).map(() => ({})) }); }],
    ['POST', /^\/v1\/forms\/([^/:]+):setPublishSettings$/, (_, c) => { const f = forms.get(c.match[1]); if (!f) return j(404, { error: { code: 404 } }); f.published = !!c.json?.publishSettings?.publishState?.isPublished; return j(200, { formId: c.match[1], publishSettings: c.json?.publishSettings }); }],
    ['GET', /^\/v1\/forms\/([^/:]+)$/, (_, c) => { const f = forms.get(c.match[1]); return f ? j(200, { formId: c.match[1], info: f.info, items: f.items, publishSettings: { publishState: { isPublished: f.published } } }) : j(404, { error: { code: 404 } }); }],
  ];
  const fake = await startFake(routes, { name: 'fake-google' });
  fake.forms = forms; fake.events = events;
  return fake;
}
