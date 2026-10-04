// SPEC §7: AC-114 Google Meet links, Calendar sync and Forms export (published explicitly), each off by default.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapter, need } from '../lib/adapters.mjs';
import { startFakeGoogle } from '../fixtures/fakes/google.mjs';

let g;
before(async () => { g = await startFakeGoogle(); });
after(async () => { await g?.close(); });
const make = async (switches) => need(await loadAdapter('google'), 'createGoogleAdapter')({ baseUrls: { meet: g.url, calendar: g.url, forms: g.url }, accessToken: 'test-secret-do-not-use-google-token', switches });
const quiz = { title: 'Day 0 diagnostic (test)', questions: [{ text: 'What does git add do?', choices: ['Stages changes', 'Pushes'], answerIndex: 0 }, { text: 'What is a PR?', choices: ['A pull request', 'A port range'], answerIndex: 0 }] };
const ev = { id: 'day-0', title: 'Class day 0', start: Date.UTC(2026, 10, 2, 4, 0), end: Date.UTC(2026, 10, 2, 12, 0), timezone: 'Asia/Kolkata' };

test('AC-114 each Google integration is off by default and makes no request when off', { timeout: 60_000 }, async () => {
  const a = await make({});
  const n = g.requests.length;
  await assert.rejects(a.createMeetLink({ title: 'x' }), /meetLinks/, 'Meet off by default');
  await assert.rejects(a.syncCalendar({ calendarId: 'primary', events: [ev] }), /calendarSync/, 'Calendar off by default');
  await assert.rejects(a.exportQuiz(quiz), /googleForms/, 'Forms off by default');
  assert.equal(g.requests.length, n, 'no request reached Google while switched off');
});

test('AC-114 Meet link, Calendar sync and Forms export (explicitly published) work against the fakes when switched on', { timeout: 60_000 }, async () => {
  const a = await make({ meetLinks: true, calendarSync: true, googleForms: true });
  const meet = await a.createMeetLink({ title: 'Day 0 live view' });
  assert.match(meet?.url ?? '', /^https:\/\/meet\.google\.com\//, 'Meet link returned');
  assert.ok(g.find('POST', /^\/v2\/spaces$/).length, 'Meet API called');

  const cal = await a.syncCalendar({ calendarId: 'primary', events: [ev] });
  assert.equal(cal?.synced, 1);
  const sent = g.find('POST', /^\/calendar\/v3\/calendars\/primary\/events$/).at(-1);
  assert.ok(sent, 'Calendar event created');
  assert.ok(JSON.stringify(sent.json).includes('Class day 0'), 'event carries the title');

  const form = await a.exportQuiz(quiz);
  assert.ok(form?.formId, 'form created');
  assert.ok(g.find('POST', /^\/v1\/forms$/).length, 'forms.create called');
  assert.equal(g.forms.get(form.formId)?.items.length, 2, 'questions added through batchUpdate');
  const pub = g.find('POST', new RegExp(`^/v1/forms/${form.formId}:setPublishSettings$`)).at(-1);
  assert.ok(pub, 'publish was requested explicitly (API-created forms start unpublished)');
  assert.equal(g.forms.get(form.formId).published, true, 'the form is published');
  assert.equal(form.published, true);
});
