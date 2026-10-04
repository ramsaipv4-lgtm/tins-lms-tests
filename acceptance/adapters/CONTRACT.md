# Adapter and CLI contract used by the acceptance suite

SPEC §7 fixes the behaviour but not the module surface. The suite imports the modules below from
`packages/adapters/src/` and runs them against the fakes in `acceptance/fixtures/fakes/`. Every base
URL is injectable so no test touches a real service. Times are ms since the epoch. "Reports" means the
promise resolves to `{ ok: false, reason, status? }` or rejects with an `Error`; tests accept both.

## `github.ts` (AC-110, AC-111)

`createGithubAdapter({ apiUrl, graphqlUrl, token, org })` returns:

| Method | Calls (fake GitHub) | Result |
|---|---|---|
| `provisionLearner({ username, team, template, repo, projectTitle })` (`template` = `"owner/name"`) | `GET /users/:u`, `POST /orgs/:org/invitations` (`invitee_id`), `PUT /orgs/:org/teams/:team/memberships/:u`, `POST /repos/:tOwner/:tName/generate`, `PUT /repos/:org/:repo/branches/main/protection` (`allow_force_pushes: false`, `required_pull_request_reviews` set), GraphQL `createProjectV2` + `createProjectV2Field` with `dataType: ITERATION` | `{ repo: "org/repo", projectId }` |
| `openPullRequest({ repo, branch, title, body? })` | `GET .../git/ref/heads/main`, `POST .../git/refs`, `POST .../pulls` | `{ number }` |
| `mergePullRequest({ repo, number })` | `PUT .../pulls/:n/merge` | `{ ok: true }` or reports |
| `writeFile({ repo, branch, path, content })` | `PUT .../contents/:path` | `{ ok: true }` or reports |
| `personaToken({ installationId, batchEndsAt, now })` | `POST /app/installations/:id/access_tokens` | `{ token, expiresAt }`, `expiresAt <= batchEndsAt`; reports when `now >= batchEndsAt` |

It never calls an account-creation endpoint (`POST /admin/users` or similar).

## `forgejo.ts` (AC-112, AC-115)

`createForgejoAdapter({ apiUrl, token, org })` (`apiUrl` ends before `/api/v1`) has the same methods.
`provisionLearner({ username, email, team, template, repo })` first creates the Forgejo login
(`POST /api/v1/admin/users`, `must_change_password: true`) when `GET /api/v1/users/:u` is 404, then adds the
team member (`PUT /api/v1/teams/:id/members/:u`), generates the repo, and sets protection on `main`
(`POST .../branch_protections`). `personaToken({ username, batchEndsAt, now })` uses
`POST /api/v1/users/:u/tokens`. Plus:

- `installPushCheck({ repo, hookUrl })` registers the push-check hook: `POST /api/v1/repos/:o/:r/hooks`
  with `config.url = hookUrl`.
- `createPushCheck({ log })` returns `{ handler, setSecretScan(on, by) }`. `handler` is a Node
  `(req, res)` listener. It receives `POST { repository, pusher, files: [{ path, content }] }` and answers
  `200 { allowed: true }` or `200 { allowed: false, message }`. With `secretScan` on (the default) any
  file matching the tins-kit secret patterns is refused with a message that says to rotate the key and
  never repeats the key. `setSecretScan(false, by)` calls `log({ switch: 'secretScan', on: false, by, at })`.

## `backup.ts` (AC-113)

- `createS3Target({ endpoint, bucket, region, accessKeyId, secretAccessKey })`: path-style S3 (works for R2).
- `createDriveTarget({ apiUrl, accessToken, folderId })`: Drive v3 upload (`uploadType=media` or `multipart`) and `?alt=media` download.
- `createFolderTarget({ dir })`: USB stick or folder.
- `backup(target, { name, bytes, passphrase })` -> `{ ref }`: encrypts (D-26) **before** upload.
- `restore(target, { ref, passphrase })` -> `Uint8Array`: rejects with a wrong passphrase.

## `google.ts` (AC-114)

`createGoogleAdapter({ baseUrls: { meet, calendar, forms }, accessToken, switches })`. A missing switch
key is off (§4.27). A call whose switch is off rejects with an error naming the switch and makes no
request.

| Method | Switch | Calls |
|---|---|---|
| `createMeetLink({ title })` -> `{ url }` | `meetLinks` | `POST /v2/spaces` |
| `syncCalendar({ calendarId, events: [{ id, title, start, end, timezone }] })` -> `{ synced }` | `calendarSync` | `POST /calendar/v3/calendars/:id/events` |
| `exportQuiz({ title, questions: [{ text, choices, answerIndex }] })` -> `{ formId, responderUri, published: true }` | `googleForms` | `POST /v1/forms`, `POST /v1/forms/:id:batchUpdate`, `POST /v1/forms/:id:setPublishSettings` |

## `health.ts` (AC-117)

- `healthDigest({ now, backups: [{ target, lastSuccessAt }], syncLagMs, checks: [{ id, ok }] })` ->
  `{ status: 'green' | 'red', backups: [{ target, lastSuccessAt, stale }], syncLagMs, failedChecks: string[] }`.
  A backup older than 48 h (or never) is `stale` and makes `status` red.
- `runMorningChecklist({ now, online, checks: [{ id, kind: 'offline' | 'online', run, lastKnownAt? }] })` ->
  results `[{ id, kind, ok, ranAt, lastKnownAt }]`, offline checks first and run first. When `online` is
  false, online checks are not run: `ok: null`, `ranAt: null`, `lastKnownAt` as given.

## MCP on the hub (AC-116)

The hub serves MCP (Streamable HTTP, JSON-RPC 2.0) at `POST /mcp`, authenticated by the session cookie.
Write tools are named `grade_edit`, `post_message` and `repo_write` and have `annotations.readOnlyHint: false`;
every other tool has `readOnlyHint: true`. A write tool changes nothing and returns
`structuredContent: { status: 'pending', diff, pendingId }`.

## Load test CLI (AC-103)

`node packages/cli/src/main.ts loadtest --learners 200 --target <url>` runs against a hub in test mode
(it may use `/__test/*`). It exits 0 when the run passes, and its **last stdout line** is a JSON summary:

```json
{ "learners": 200, "requests": 1234, "within1sPct": 99.1, "p95Ms": 310,
  "quizAnswers": 200, "quizWindowMs": 4200, "lostWrites": 0, "pass": true }
```
