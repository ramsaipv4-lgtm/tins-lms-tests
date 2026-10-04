// AC-157 Trainer pack and package library (A-11, E-5) (SPEC §6.3).
// data-testids used: app-ready*, trainer-pack*, package-library*
// Accessible names used: trainer nav /trainer pack|my pack|day pack|prep/; nav /library|package library|packages/.
import { journey, see, tid, nav, waitText, step, at, P } from './_harness.mjs';

journey({
  name: 'trainer-pack', acs: ['AC-157'], title: "per day the trainer sees deck, cheat sheet, command reference, likely questions; library lists packages with versions and rehearsals",
  clock: at(0, '07:00'),
  async run(j) {
    const t = await j.actor('trainer', P.trainer);
    await nav(t, /^(trainer pack|my pack|day pack|prep)$/i, 'trainer pack');
    const pack = await see(tid(t, 'trainer-pack'), 'trainer-pack', 30_000);
    const text = await pack.innerText();
    for (const [re, what] of [[/cards?|deck/i, 'card deck'], [/cheat.?sheet/i, 'cheat sheet'], [/command/i, 'command reference'], [/likely questions|questions/i, 'likely questions']]) {
      if (!re.test(text)) throw new Error(`trainer-pack should show the ${what} (SPEC AC-157)`);
    }
    await waitText(pack, /kettle/i, 'day content from the fixture package (Kettle)');
    await step(t, 'trainer pack');
    await nav(t, /^(library|package library|packages)$/i, 'package library');
    const lib = await see(tid(t, 'package-library'), 'package-library');
    await waitText(lib, /track1|kettle/i, 'the imported fixture package');
    await waitText(lib, /version|v\d/i, 'its version');
    await waitText(lib, /rehears/i, 'rehearsal history (none yet is fine)');
    await step(t, 'library');
  },
});
