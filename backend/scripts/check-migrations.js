import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const expected = Array.from({ length: 13 }, (_, index) => String(index + 1).padStart(3, '0'));
const files = (await readdir(directory)).filter((file) => /^\d{3}_.+\.sql$/.test(file)).sort();
const prefixes = files.map((file) => file.slice(0, 3));
if (prefixes.join(',') !== expected.join(',')) throw new Error('Migration inventory must contain ordered migrations 001 through 013 exactly once.');
for (const file of files) {
  const sql = await readFile(path.join(directory, file), 'utf8');
  if (/\bDROP\s+(DATABASE|SCHEMA)\b/i.test(sql)) throw new Error(`Migration ${file} contains a prohibited destructive statement.`);
}
console.log(`Migration static check passed (${files.length} files; not applied).`);
