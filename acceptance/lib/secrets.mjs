// Secret patterns copied from tins-kit src/secrets.mjs (SPEC AC-77, AC-120). Reports class + location, never the value.
const RULES = [
  ['aws-access-key-id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['slack-token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['stripe-live-key', /\b[sr]k_live_[A-Za-z0-9]{16,}/],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['openai-key', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['private-key-block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----/],
  ['url-with-password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]{6,})@[^\s]+/i],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
const ASSIGN = /\b([A-Za-z0-9_]*(?:secret|passwd|password|api[_-]?key|token|private[_-]?key|access[_-]?key)[A-Za-z0-9_]*)\b\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/i;
const PLACEHOLDER = /^(?:x+|\*+|<.*>|\$\{.*\}|changeme|example|placeholder|your[_-].*|dummy.*|test.*|fake.*|redacted)$/i;
function entropy(s) {
  const f = {}; for (const c of s) f[c] = (f[c] || 0) + 1;
  return Object.values(f).reduce((h, n) => h - (n / s.length) * Math.log2(n / s.length), 0);
}
export function classify(text) {
  for (const [name, re] of RULES) {
    const m = text.match(re);
    if (m && !(name === 'url-with-password' && PLACEHOLDER.test(m[1]))) return name;
  }
  const a = text.match(ASSIGN);
  if (a && !PLACEHOLDER.test(a[2]) && entropy(a[2]) >= 3.5) return 'generic-assignment';
  return null;
}
export function scanText(path, text) {
  const out = [];
  text.split(/\r?\n/).forEach((t, i) => { const c = classify(t); if (c) out.push({ path, line: i + 1, class: c }); });
  return out;
}
export const formatFinding = (f) => `${f.path}:${f.line}: ${f.class}`;

// Planted secrets: invented values, assembled at runtime so this source never holds a token-shaped literal.
const j = (...p) => p.join('');
export const PLANTED = {
  githubToken: j('gh', 's_', 'TESTONLYdoNotUse0123456789abcdefABCDEFGH'),
  awsKeyId: j('AK', 'IA', 'FAKETESTKEY00001'),
  passphrase: 'test-secret-do-not-use-1234',
  s3Secret: 'test-secret-do-not-use-s3-5678',
  googleSecret: 'test-secret-do-not-use-google-9012',
  bearer: 'test-secret-do-not-use-bearer-3456',
};
/** Env vars that plant secrets into a server under test (names are invented; values are fake). */
export const PLANTED_ENV = {
  LMS_GITHUB_APP_TOKEN: PLANTED.githubToken,
  LMS_S3_ACCESS_KEY_ID: PLANTED.awsKeyId,
  LMS_S3_SECRET_ACCESS_KEY: PLANTED.s3Secret,
  LMS_GOOGLE_CLIENT_SECRET: PLANTED.googleSecret,
  LMS_BACKUP_PASSPHRASE: PLANTED.passphrase,
};
/** Returns the names of planted values found in text. */
export function plantedIn(text, extra = {}) {
  const all = { ...PLANTED, ...extra };
  return Object.entries(all).filter(([, v]) => v && text.includes(v)).map(([k]) => k);
}
