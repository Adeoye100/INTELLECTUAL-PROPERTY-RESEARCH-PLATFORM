import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontendRoot = path.join(repositoryRoot, 'frontend');
const sourceRoots = [path.join(frontendRoot, 'src'), path.join(frontendRoot, 'index.html')];
const forbiddenVariableNames = [
  'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'POSTGRES_URL',
  'JWT_ACCESS_SECRET', 'AUTH_RATE_LIMIT_KEY_SECRET', 'REDIS_URL', 'ELASTICSEARCH_URL',
  'PDF_EXPORT_STORAGE_ROOT', 'USPTO_TSDR_API_KEY',
];
// The Supabase SDK contains internal development strings. Inspect the Vite
// substituted public configuration instead of treating dependency internals as
// an application endpoint. The report names only the rule, never its value.
const productionBundlePatterns = [
  ['VITE_API_BASE_URL configured as a local endpoint', /VITE_API_BASE_URL\s*:\s*['"`](?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[?::1\]?)/i],
  ['VITE_SUPABASE_URL configured as a local endpoint', /VITE_SUPABASE_URL\s*:\s*['"`](?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[?::1\]?)/i],
  ['VITE_API_BASE_URL configured as a placeholder', /VITE_API_BASE_URL\s*:\s*['"`][^'"`]*(?:your[-_]|placeholder|replace[-_]?me|\.invalid)/i],
  ['VITE_SUPABASE_URL configured as a placeholder', /VITE_SUPABASE_URL\s*:\s*['"`][^'"`]*(?:your[-_]|placeholder|replace[-_]?me|\.invalid)/i],
];

async function filesUnder(target) {
  const information = await stat(target);
  if (information.isFile()) return [target];
  const entries = await readdir(target, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => filesUnder(path.join(target, entry.name))))).flat();
}

async function assertNoMatches(targets, markers, label) {
  const matches = [];
  for (const file of (await Promise.all(targets.map(filesUnder))).flat()) {
    const contents = await readFile(file, 'utf8');
    for (const marker of markers) {
      if (contents.includes(marker)) matches.push(`${path.relative(repositoryRoot, file)} (${marker})`);
    }
  }
  if (matches.length) throw new Error(`${label}: ${matches.join(', ')}`);
}

async function assertNoPatternMatches(targets, patterns, label) {
  const matches = [];
  for (const file of (await Promise.all(targets.map(filesUnder))).flat()) {
    const contents = await readFile(file, 'utf8');
    for (const [description, pattern] of patterns) {
      if (pattern.test(contents)) matches.push(`${path.relative(repositoryRoot, file)} (${description})`);
    }
  }
  if (matches.length) throw new Error(`${label}: ${matches.join(', ')}`);
}

await assertNoMatches(sourceRoots, forbiddenVariableNames, 'Frontend source contains a backend-secret variable name');

const requireDist = process.argv.includes('--require-dist');
const dist = path.join(frontendRoot, 'dist');
if (!requireDist) {
  console.log('Frontend source secret check passed (build-output check requires --require-dist).');
  process.exit(0);
}
try {
  await stat(dist);
  await assertNoMatches([dist], forbiddenVariableNames, 'Frontend build output contains a backend-secret variable name');
  await assertNoPatternMatches([dist], productionBundlePatterns, 'Frontend build output contains an unsafe configured endpoint');
} catch (error) {
  if (error?.code === 'ENOENT' && !requireDist) {
    console.log('Frontend source secret check passed (build output not present).');
    process.exit(0);
  }
  throw error;
}

console.log('Frontend source and build-output secret checks passed.');
