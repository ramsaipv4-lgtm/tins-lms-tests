# API details assumed by the acceptance suite

SPEC §5 names most routes. The tests also rely on the details below, which SPEC leaves open. Each one
is proposed as SPEC wording; until SPEC adopts it, treat this file as part of the contract.

## Ids, seeds and sessions

- Ids are `<type>:<key>`. Route parameters, `/__test/login` `personId`, `enrolment.personId` and
  database names use the **key**: class `c1` is `class:c1` in `class-c1`; learner `l1` is `person:l1` with
  personal database `person-l1`.
- `POST /__test/seed { fixture }`: `fixture` is a path relative to `acceptance/fixtures`
  (e.g. `api/base.json`). The file is `{ "databases": { "<dbName>": [doc, ...] } }`; docs are written as
  given (`_id` = `id`). A `day` section may carry `body`: the section's plaintext, which the server serves
  only sealed (AC-68).
- `POST /__test/login { personId, roles }` works for any person id, seeded or not.
- Validation errors: `400 { error: { <field>: <message> } }` (SPEC §5).

## Routes not named in SPEC

| Route | Who | Request -> response |
|---|---|---|
| `GET /api/me` | any session | `{ personId, roles, minor, coachTrackers, tnc: { version, acceptedAt, needsAcceptance } }` |
| `GET /api/join/tnc` | no session | `{ version, text }` |
| `POST /api/join` | no session | `{ code, name, rollNumber, dob, tncVersion }` -> 2xx + session cookie; body contains `already-enrolled` when the roll number is already enrolled in that class; reused code -> 4xx |
| `POST /api/classes/:id/join-codes` | trainer | -> `{ code }` (one-time) |
| `POST /api/admin/tnc` | admin | `{ version, text }` publishes a new T&C version |
| `POST /api/me/tnc` | any session | `{ version }` accepts it |
| `POST /api/pairing` | trainer | -> `{ code, qr }`; `qr` (string or object) holds the hub id, the current address and the fingerprint |
| `GET /api/pairing/fingerprint` | any session | body holds the CA's SHA-256 fingerprint as hex (colons allowed) |
| `POST /api/pairing/claim` | no session | `{ code, deviceId }` -> 2xx + device session; 4xx whose body says `used` / `expired` / `unknown` |
| `GET /api/devices`, `DELETE /api/devices/:deviceId` | trainer/admin | list contains device ids |
| `GET /api/classes/:id/attendance-code` | trainer | a 6-digit string field and a numeric seconds-left field (key containing `sec`, `left` or `remain`) |
| `GET /api/classes/:id/printed-code?day=N` | trainer | -> `{ code }` printed fallback |
| `POST /api/classes/:id/attendance` | learner | `{ code }`; writes an `attendance` doc (`method` `rotating` or `printed`, `verified`) |
| `POST /api/packages` | admin/trainer | body = ustar tar -> `{ id, status, checks: [{ id, pass, waived, detail }] }`; failing -> `status: 'draft'` |
| `POST /api/packages/:id/publish` | admin/trainer | 4xx for a draft with failing checks |
| `GET /api/classes/:id/days/:index` | learner | `{ sections: [{ id, graded, sealed, key? }] }`; `sealed` = base64 of `sealSection` output (IV prefixed); `key` = base64 raw AES key, present only once released |
| `POST /api/classes/:id/teleprompter` | trainer | `{ sectionId }` or `{ releaseAll: true }` |
| `POST /api/classes/:id/attempts` | learner | `{ itemId, mode, answers, timing: { hubStart, hubEnd, monotonicMs, deviceStart, deviceEnd }, aiUsage }` -> `{ id }`; stores an `attempt` doc with `seed`, `timing.flags` and an AI-usage summary string |
| `POST /api/classes/:id/attempts/:attemptId/grade` | trainer (sign-off; substitute 403) | `{ score, reason? }`; first call appends a ledger entry, later calls append a correction (`corrects`) |
| `POST /api/classes/:id/appeals` | learner | `{ attemptId, reason }`; after 7 days 4xx with `window-closed` |
| `GET /api/classes/:id/appeals` | trainer | list (or `{ appeals }`) of `{ attemptId, evidence: { seed, mode, events, rubricRows, unreadConfirmations } }` |
| `POST /api/classes/:id/integrity`, `GET ...?personId=` | learner / trainer | event `{ context: 'exam' | 'practice', kind, at }`; list (or `{ events }`) |
| `POST /api/me/device-key` | any session | `{ deviceId, publicJwk }` registers the device signing key used by AC-76 |
| `POST /api/import` | admin | body = the tar from `GET /api/export` |

## Sync

- Old clients announce their schema with the request header `x-lms-schema: <n>`. Every `/db/*` request
  from a client more than 2 versions behind is refused with 4xx and a body containing `update-app`.
- The hub's merge pass (D-24) runs on its own within a few seconds of a conflicting write.
- Personal databases refuse `coachEntry` documents that carry plaintext fields (`kind`, `values`,
  `source`); an encrypted entry carries `enc: { iv, ct }` instead. A minor's personal database refuses every
  `coachEntry` with 403.

## Export

- The export tar has `manifest.json` (paths relative to the manifest's folder, sorted; the manifest does
  not list itself), CSV files whose names contain `roster`, `attendance` and `grade`, at least one `.md`,
  JSON files whose name or folder contains `ledger` and `event`, and a `board` file or folder.
- `GET /api/classes/:id/package?day=N` returns the `signPackage` container (§4.24) as raw bytes.
