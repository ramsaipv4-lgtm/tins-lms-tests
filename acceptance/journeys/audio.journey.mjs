// AC-163 Audio quick-learn (B-10) (SPEC §6.3).
// data-testids used: app-ready*
// Accessible names used: learner nav /today|day 0/ then /quick.?learn/; button /play|listen|read aloud/;
//   field /speed/ (select, slider or number) set to 1.5.
// speechSynthesis is replaced by a recorder (init script) so the test does not depend on installed voices:
// window.__spoken = [{ text, rate }].
import { journey, nav, click, clickIfPresent, fill, until, step, at, P, assert } from './_harness.mjs';

const speechSpy = () => {
  window.__spoken = [];
  const synth = { speaking: false, pending: false, paused: false, onvoiceschanged: null,
    speak(u) { window.__spoken.push({ text: u.text, rate: u.rate }); setTimeout(() => { u.onstart?.(new Event('start')); u.onend?.(new Event('end')); }, 50); },
    cancel() {}, pause() {}, resume() {}, getVoices() { return [{ name: 'Test English', lang: 'en-IN', default: true, localService: true, voiceURI: 'test' }]; },
    addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  if (!window.SpeechSynthesisUtterance) window.SpeechSynthesisUtterance = function (t) { this.text = t; this.rate = 1; };
};

journey({
  name: 'audio', acs: ['AC-163'], title: "the day's quick-learn has a play button using speech synthesis, with speed control",
  clock: at(0, '18:00'),
  async run(j) {
    const page = await j.actor('learner', P.l1, { initScripts: [speechSpy] });
    await nav(page, /^(today|day 0|class|my class)$/i, 'day page');
    await nav(page, /quick.?learn/i, 'quick-learn');
    const play = /^(play|listen|read aloud|play audio)$/i;
    await click(page, play, 'play');
    const first = await until(() => page.evaluate(() => window.__spoken[0]), 'speechSynthesis.speak to be called');
    assert.match(first.text, /kettle/i, 'the spoken text is the quick-learn content');
    await step(page, 'playing');
    const speed = page.getByLabel(/speed/i).first();
    if ((await speed.getAttribute('type')) === 'range') await speed.fill('1.5'); else await fill(page, /speed/i, '1.5');
    await clickIfPresent(page, /^(stop|pause)$/i, 1500);
    await click(page, play, 'play again');
    await until(() => page.evaluate(() => window.__spoken.some((s) => Math.abs(s.rate - 1.5) < 0.01)), 'an utterance at rate 1.5');
    await step(page, 'speed 1.5');
  },
});
