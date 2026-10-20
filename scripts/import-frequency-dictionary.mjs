// Optional maintenance command; production builds use the committed compact data.
// Input: verified Nichu/zhwiktionary snapshot, never executable dictionary content.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createGunzip, gunzipSync, gzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';

const filename = process.argv[2];
if (!filename) throw new Error('Usage: node scripts/import-frequency-dictionary.mjs /path/to/dictionary.jsonl.gz');
const expected = '4b19151f8b38b2d8d630b96a853227b2230666adc5b058be9eac3c4767860c82';
const source = await fs.readFile(filename);
if (createHash('sha256').update(source).digest('hex') !== expected) throw new Error('Dictionary snapshot SHA-256 mismatch');
const corpus = JSON.parse(gunzipSync(await fs.readFile('src/data/bank-frequency/corpus.json.gz')));
const labels = new Set(corpus.terms.map(term => term[0].normalize('NFKC')));
const records = {}, redirects = new Map(), allEntries = new Map(), kana = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const hiragana = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
for await (const line of createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity })) {
  const row = JSON.parse(line);
  if (row.lang_code !== 'ja') continue;
  if (row.redirects?.length) redirects.set(row.word.normalize('NFKC'), row.redirects);
  const glosses = [...new Set((row.senses ?? []).flatMap(sense => sense.glosses ?? []).map(text => text.trim()).filter(Boolean))];
  if (!glosses.length) continue;
  const readings = new Set();
  for (const form of row.forms ?? []) {
    if (!form.tags?.includes('canonical') || !form.ruby?.length || form.form !== row.word) continue;
    let cursor = 0, reading = '';
    for (const [text, ruby] of form.ruby) {
      const at = row.word.indexOf(text, cursor);
      if (at < cursor) { reading = ''; break; }
      reading += row.word.slice(cursor, at) + ruby; cursor = at + text.length;
    }
    if (reading && kana.test(reading + row.word.slice(cursor))) readings.add(hiragana(reading + row.word.slice(cursor)));
  }
  const legacyReading = glosses.join('\n').match(/【([ぁ-んァ-ヶー]+)】/);
  if (legacyReading) readings.add(hiragana(legacyReading[1]));
  if (kana.test(row.word)) readings.add(hiragana(row.word));
  const aliases = new Set([row.word, ...(row.forms ?? []).filter(form => form.tags?.some(tag => ['canonical', 'alternative'].includes(tag))).map(form => form.form)]);
  // Kana spellings are valid only when the source gives that exact reading.
  for (const reading of readings) aliases.add(reading);
  const entry = { word: row.word, pos: row.pos, readings: [...readings], glosses: glosses.slice(0, 8) };
  allEntries.set(row.word.normalize('NFKC'), [...(allEntries.get(row.word.normalize('NFKC')) ?? []), entry]);
  for (const alias of aliases) {
    const key = alias.normalize('NFKC');
    if (!labels.has(key)) continue;
    records[key] ??= [];
    if (!records[key].some(item => JSON.stringify(item) === JSON.stringify(entry))) records[key].push(entry);
  }
}
for (const label of labels) {
  if (records[label] || !redirects.has(label)) continue;
  // Resolve explicit source redirects only, with a cycle/chain bound.
  let targets = redirects.get(label);
  const visited = new Set([label]);
  for (let depth = 0; depth < 4 && targets?.length; depth++) {
    const next = [];
    for (const target of targets) {
      const key = target.normalize('NFKC');
      if (visited.has(key)) continue;
      visited.add(key);
      if (allEntries.has(key)) records[label] = [...(records[label] ?? []), ...allEntries.get(key)];
      else next.push(...(redirects.get(key) ?? []));
    }
    targets = next;
  }
}
const out = 'src/data/frequency-dictionary';
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'entries.json.gz'), gzipSync(JSON.stringify(records), { level: 9 }));
await fs.writeFile(path.join(out, 'source.json'), JSON.stringify({ source: '中文维基词典贡献者；Wiktextract / Kaikki.org；Nichū Offline Dictionary', snapshot: '2026-10-01', license: 'CC-BY-SA-4.0', url: 'https://github.com/Hanbin-Zhang-JPN/nichu-offline-dictionary', snapshotSha256: expected, modifications: '保留当前词频索引所需的词头、源明确读音、词性及最多八个中文义项；派生查询视图。', headwords: Object.keys(records).length }, null, 2) + '\n');
const missing = [...labels].filter(label => !records[label]);
console.log(JSON.stringify({ headwords: labels.size, matched: labels.size - missing.length, missing: missing.length, examples: missing.slice(0, 65) }, null, 2));
await fs.writeFile('/tmp/frequency-dictionary-missing.json', JSON.stringify(missing));
