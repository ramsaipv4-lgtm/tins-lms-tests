// Smoke (visible to builders): UI strings live in packages/web/src/strings/en.json (SPEC AC-123).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ROOT } from '../lib/paths.mjs';

test('smoke: packages/web/src/strings/en.json exists and is a non-empty JSON object', { timeout: 10_000 }, () => {
  const p = join(APP_ROOT, 'packages', 'web', 'src', 'strings', 'en.json');
  assert.ok(existsSync(p), `strings file not found: ${p} (SPEC AC-123)`);
  const json = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(json && typeof json === 'object' && Object.keys(json).length > 0, 'en.json has strings');
});
