// Reproduce from a local checkout; builds never fetch an unpinned remote list.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const checkout = process.argv[2];
if (!checkout) throw new Error('Usage: node scripts/import-frequency-levels.mjs /path/to/yomitan-jlpt-vocab');
const output = new URL('../src/data/frequency-levels/', import.meta.url);
await fs.mkdir(output, {recursive: true});
const entries = [];
const hash = createHash('sha256');
for (let level = 1; level <= 5; level++) {
  const bytes = await fs.readFile(path.join(checkout, `yomitan-jlpt-vocab/term_meta_bank_${level}.json`));
  hash.update(bytes);
  for (const [word, , info] of JSON.parse(bytes)) entries.push([word, info.reading, info.frequency.displayValue]);
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: checkout, encoding: 'utf8'}).trim();
await fs.writeFile(new URL('entries.json', output), JSON.stringify(entries) + '\n');
await fs.copyFile(path.join(checkout, 'LICENSE.txt'), new URL('LICENSE.txt', output));
await fs.writeFile(new URL('source.json', output), JSON.stringify({
  name: 'Jonathan Waller / Tanos · Stephen Kraus (yomitan-jlpt-vocab)',
  url: 'https://github.com/stephenmk/yomitan-jlpt-vocab', revision,
  license: 'CC BY-SA 4.0', sha256: hash.digest('hex'), entries: entries.length,
  note: 'Public reference levels, not an official JLPT vocabulary syllabus. Match spelling and reading; retain multiple reference levels when supplied.',
}, null, 2) + '\n');
console.log(`Imported ${entries.length} reference-level spellings at ${revision}`);
