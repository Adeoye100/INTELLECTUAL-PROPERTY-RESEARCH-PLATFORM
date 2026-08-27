import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = readFileSync(0, 'utf8').split('\0').filter(Boolean);
if (tracked.length === 0) {
  throw new Error('Tracked file list is required on standard input; run through pnpm security:secrets.');
}
const ignored = /^(backend\/test\/|Documentations\/|.*\.example$|.*lock$)/;
const patterns = [
  ['private-key', /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/],
  ['provider-token', /\b(?:ghp_|github_pat_|sk_live_|rk_live_)[A-Za-z0-9_-]{16,}/],
  ['database-credential', /(?:DATABASE_URL|REDIS_URL)\s*[=:]\s*['"]?(?:postgres(?:ql)?|redis):\/\/[^\s:'"`]+:[^\s@'"`]+:(?![\[<$])[^\s@\]\>'"`]+@/i],
  ['service-credential', /(?:SUPABASE_SECRET_KEY|JWT_ACCESS_SECRET|AUTH_RATE_LIMIT_KEY_SECRET)\s*[=:]\s*['"]?(?=[A-Za-z0-9_-]{24,})(?=[^\s'"`]*[A-Z])(?=[^\s'"`]*[a-z])(?=[^\s'"`]*\d)[A-Za-z0-9_-]{24,}/],
];
const findings = [];
for (const relative of tracked) {
  if (ignored.test(relative)) continue;
  let content;
  try { content = readFileSync(path.join(root, relative), 'utf8'); } catch { continue; }
  for (const [category, pattern] of patterns) {
    if (pattern.test(content)) findings.push({ file: relative, category });
  }
}
if (findings.length) {
  for (const finding of findings) console.error(`Potential ${finding.category}: ${finding.file}`);
  process.exitCode = 1;
} else console.log('Tracked-file secret-pattern scan completed with no reportable finding.');
