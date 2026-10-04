# tins-lms-tests: acceptance suite for Coach LMS v1

The acceptance suite for [`tins-lms`](https://github.com/ramsaipv4-lgtm/tins-lms) `SPEC.md`. Each test
file names the `AC-n` rows it checks.

**For builders:** read `SPEC.md` and `acceptance/smoke/` only. Reading the rest of this suite during
the build experiment voids that run's score (SPEC D-40).

## Use

Clone this repo **into the app repo** as `acceptance/`'s parent:

```sh
cd tins-lms
git clone https://github.com/ramsaipv4-lgtm/tins-lms-tests .acceptance-src
ln -s .acceptance-src/acceptance acceptance      # or copy it
node acceptance/run.mjs core        # or: api, journeys, perf, adapters, smoke, all
```

The app repo's own dependencies (SPEC §1.1) provide Playwright and PouchDB; this suite adds none.

## Layout

| Folder | Checks | Needs |
|---|---|---|
| `core/` | SPEC §4 (pure functions) | `packages/core/src/index.ts` |
| `api/` | SPEC §5, §8 | the server (`packages/server/src/main.ts`) |
| `journeys/` | SPEC §6 | the built web app served by the server, Chromium |
| `perf/` | SPEC §6.1, §6.2 | as journeys, plus `packages/cli` |
| `adapters/` | SPEC §7 | `packages/adapters`, fake servers in `fixtures/fakes/` |
| `smoke/` | a visible subset for builders | as above |
| `fixtures/` | synthetic data only; no real course material | — |
| `lib/` | shared helpers | — |
