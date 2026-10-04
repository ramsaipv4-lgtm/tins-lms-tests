// Smoke (visible to builders): packages/core/src/index.ts exports every function named in SPEC §4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CORE_ENTRY } from '../lib/paths.mjs';

const NAMES = [
  'createRng', 'seedFor', 'shuffle', 'newCard', 'reviewCard', 'dueCards', 'spreadBacklog', 'catchUpState', 'gradedDueDate',
  'masteryMap', 'attendanceCode', 'verifyAttendanceCode', 'issuePairing', 'claimPairing', 'emptyPairingState', 'sectionKey',
  'sealSection', 'openSection', 'releasePlan', 'isReleased', 'pace', 'parseScriptSections', 'scriptTotalSec', 'appendEntry',
  'verifyLedger', 'currentValue', 'startShift', 'applyShiftEvent', 'slaReport', 'scoreShift', 'openAppeal', 'appealStep',
  'appealTick', 'aiAllowed', 'aiUsageSummary', 'mergeRevisions', 'formGroups', 'applyGroupOverrides', 'pokerRound',
  'parseStandup', 'checkExplanation', 'validateRules', 'applyParseRules', 'tallyExitTickets', 'suggestFaq', 'atRisk',
  'itemAnalysis', 'clusterSubmissions', 'reflow', 'buildManifest', 'verifyManifest', 'tarPack', 'tarUnpack',
  'generateSigningKeys', 'signPackage', 'openPackage', 'recoveryWords', 'wordsToEntropy', 'wrapPersonKey', 'unwrapPersonKey',
  'shred', 'gradedTiming', 'effectiveLimitMs', 'switchDefaults', 'isOn', 'canSync', 'parsePackage', 'runGate', 'dropPlan',
  'undoDropPlan', 'retentionDue', 'waLink', 'copyAll', 'certificateId', 'verifyCertificateId',
];

test('smoke: core exports every SPEC §4 function', { timeout: 30_000 }, async () => {
  assert.ok(existsSync(CORE_ENTRY), `core entry not found: ${CORE_ENTRY} (SPEC §2)`);
  const core = await import(pathToFileURL(CORE_ENTRY).href);
  const missing = NAMES.filter((n) => typeof core[n] !== 'function');
  assert.deepEqual(missing, [], `packages/core/src/index.ts is missing exports (SPEC §4): ${missing.join(', ')}`);
});
