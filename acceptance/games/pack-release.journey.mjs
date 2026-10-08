// AC-215 Importing a course package with a broken game pack fails the content gate (check G9-games, which can never be
// waived) with the pack check's message; a valid pack is released on its `day` (the start of class.schedule[day]) and
// appears in the arcade only from then (games contract D-G14).
// The broken package (fixtures/games/package-broken: the v1 package plus one pack without a title) is uploaded through
// POST /api/packages (Appendix A); the expected message is what `games check` prints for that pack file.
// The valid pack sd-later (fixtures/games/package, day 2) is checked in the syntax-drop picker on day 1 and day 2.
// data-testids used: app-ready*, game-pack-<packId>, game-unavailable
// Seeds: games-base, games-seen.
import { join } from 'node:path';
import { assert, step, see, notSee, tid, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, GFIX, runCli, problemLines, gameUrl } from '../lib/games.mjs';
import { pack, readTree } from '../lib/ustar.mjs';

gamesJourney({
  name: 'pack-release', acs: ['AC-215'], title: 'a broken pack fails G9-games with the pack check message; a valid pack appears on its day',
  seeds: ['games-base', 'games-seen'], clock: at(1, '10:00'),
  async run(j) {
    const brokenFile = join(GFIX, 'package-broken', 'track1', 'games', 'syntax-drop', 'broken-missing-title.json');
    const cli = await runCli(['games', 'check', brokenFile]);
    const line = problemLines(cli.out)[0] || '';
    const message = line.split(': ').slice(2).join(': ').trim();
    assert.ok(message, `games check prints a problem line for the broken pack (${cli.out.slice(0, 300)})`);
    await j.server.login(...P.trainer);
    const r = await j.server.request('/api/packages', { method: 'POST', body: pack(readTree(join(GFIX, 'package-broken'))), headers: { 'content-type': 'application/x-tar' } });
    assert.ok(r.status < 300, `upload answers 2xx (${r.status} ${r.text.slice(0, 200)})`);
    assert.equal(r.json?.status, 'draft', 'the package stays a draft');
    const g9 = (r.json?.checks || []).find((c) => c.id === 'G9-games');
    assert.ok(g9, 'the gate reports G9-games');
    assert.equal(g9.pass, false, 'G9-games fails');
    assert.ok(String(g9.detail).includes(message), `G9-games detail ${JSON.stringify(g9.detail)} carries the pack check's message ${JSON.stringify(message)}`);
    const pub = await j.server.request(`/api/packages/${encodeURIComponent(r.json.id)}/publish`, { method: 'POST', body: {} });
    assert.ok(pub.status >= 400, 'a package failing G9-games cannot be published');

    const page = await j.actor('learner', P.l1, { path: '/learn/games/syntax-drop?story=off' });
    await see(tid(page, 'game-pack-sd-strike'), 'game-pack-sd-strike (released on day 0)', 20_000);
    await notSee(tid(page, 'game-pack-sd-later'), 'game-pack-sd-later before day 2');
    await j.open(page, gameUrl('syntax-drop', 'sd-later', '1'));
    await see(tid(page, 'game-unavailable'), 'game-unavailable for an unreleased pack', 15_000);
    await step(page, 'day 1: not released');
    await j.clock(at(2, '09:01'));
    await j.open(page, '/learn/games/syntax-drop?story=off');
    await see(tid(page, 'game-pack-sd-later'), 'game-pack-sd-later on day 2', 20_000);
    await step(page, 'day 2: released');
  },
});
