// SPEC §4.27 Feature switches: AC-49.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const DEFAULTS = {
  secretScan: true, diskEncryptionCheck: false, planVsActual: false, calendarSync: false, pairProgramming: false,
  explainBackAi: false, googleForms: false, meetLinks: false, storyMode: false, headingStrike: true, teamBadges: true,
  celebrationWall: true, githubPass: true, jira: false, printedQrFallback: true, voiceFollow: false, certificates: true, gradedShifts: true,
};

test('AC-49 switchDefaults returns exactly the SPEC table', () => {
  const switchDefaults = fn('switchDefaults');
  assert.deepEqual(switchDefaults(), DEFAULTS);
});

test('AC-49 precedence is class > program > org > default', () => {
  const isOn = fn('isOn');
  assert.equal(isOn('jira', {}), false);
  assert.equal(isOn('secretScan', {}), true);
  assert.equal(isOn('jira', { org: { jira: true } }), true);
  assert.equal(isOn('jira', { org: { jira: true }, program: { jira: false } }), false);
  assert.equal(isOn('jira', { org: { jira: false }, program: { jira: false }, class: { jira: true } }), true);
  assert.equal(isOn('secretScan', { class: { secretScan: false }, program: { secretScan: true }, org: { secretScan: true } }), false);
  assert.equal(isOn('meetLinks', { class: { jira: true }, program: { meetLinks: true } }), true, 'a layer without the key falls through');
  assert.equal(isOn('headingStrike', { class: {}, program: {}, org: {} }), true);
});

test('AC-49 an unknown switch name throws', () => {
  const isOn = fn('isOn');
  assert.equal(isOn('certificates', {}), true);
  assert.throws(() => isOn('quantumMode', {}));
  assert.throws(() => isOn('quantumMode', { class: { quantumMode: true } }));
});
