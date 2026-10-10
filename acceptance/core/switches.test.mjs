// SPEC §4.27 Feature switches: AC-49.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../lib/core.mjs';

const DEFAULTS = {
  secretScan: true, diskEncryptionCheck: false, planVsActual: false, calendarSync: false, pairProgramming: false,
  explainBackAi: false, googleForms: false, meetLinks: false, storyMode: false, headingStrike: true, teamBadges: true,
  celebrationWall: true, githubPass: true, jira: false, printedQrFallback: true, voiceFollow: false, certificates: true, gradedShifts: true,
  // games (SPEC D-49, AC-49): the nine availability switches on, and games.unlockAll (D-78) off
  games: true, 'game.syntaxDrop': true, 'game.mazeCoder': true, 'game.breakout': true, 'game.raid': true,
  'game.sniper': true, 'game.whackABug': true, 'game.aftershock': true, 'game.garage': true,
  'games.unlockAll': false,
};

test('AC-49 switchDefaults returns exactly the SPEC table plus the ten games keys (D-49)', () => {
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
  // the games keys follow the same precedence (D-49, D-78)
  assert.equal(isOn('games.unlockAll', {}), false, 'games.unlockAll is off by default');
  assert.equal(isOn('games.unlockAll', { org: { 'games.unlockAll': true } }), true);
  assert.equal(isOn('games.unlockAll', { org: { 'games.unlockAll': true }, program: { 'games.unlockAll': false } }), false);
  assert.equal(isOn('games.unlockAll', { program: { 'games.unlockAll': false }, class: { 'games.unlockAll': true } }), true, 'a class can open every level');
  assert.equal(isOn('game.syntaxDrop', { class: { 'game.syntaxDrop': false }, org: { 'game.syntaxDrop': true } }), false);
  assert.equal(isOn('games', { class: { 'games.unlockAll': true } }), true, 'games.unlockAll does not change games');
});

test('AC-49 an unknown switch name throws', () => {
  const isOn = fn('isOn');
  assert.equal(isOn('certificates', {}), true);
  assert.throws(() => isOn('quantumMode', {}));
  assert.throws(() => isOn('quantumMode', { class: { quantumMode: true } }));
});
