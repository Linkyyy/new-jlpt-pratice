import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { gunzipSync, gzipSync } from 'node:zlib';
import kuromoji from 'kuromoji';
import { createFrequencyBuilder, frequencyMetadata } from '../src/lib/bank-frequency.mjs';
import { annotateFrequencyCorpus } from '../src/lib/frequency-definitions.mjs';
import { annotateFrequencyLevels } from '../src/lib/frequency-levels.mjs';
import { reviewFrequencyCorpus, correctFrequencyReadings } from '../src/lib/frequency-quality.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'src/data/bank-frequency');
const imported = path.join(root, 'src/data/imported-bank/questions');
const files = (await fs.readdir(imported)).filter(file => /^\d{6}-N[1-5]-[1-4]\.json$/.test(file)).sort();
const inputs = ['src/data/question-bank.json', 'src/data/imported-bank/index.json', 'src/lib/bank-frequency.mjs', 'src/lib/frequency-lexicon.mjs', 'src/lib/frequency-idioms.mjs', 'src/lib/frequency-subtypes.mjs', 'src/lib/frequency-definitions.mjs', 'src/lib/frequency-word-supplements.mjs', 'src/lib/frequency-study-notes.mjs', 'src/data/frequency-dictionary/source.json', 'scripts/build-bank-frequency.mjs', ...files.map(file => `src/data/imported-bank/questions/${file}`)];
inputs.push('src/lib/frequency-simplified.mjs', 'src/lib/frequency-levels.mjs', 'src/data/frequency-levels/entries.json', 'src/data/frequency-levels/source.json');
inputs.push('src/lib/frequency-quality.mjs', 'src/data/frequency-levels/expression-entries.json', 'src/data/frequency-levels/expression-source.json');
const digest = createHash('sha256').update('kuromoji@0.1.2/ipadic/v1/opencc-js@1.0.5');
const contents = new Map();
for (const name of inputs) { const text = await fs.readFile(path.join(root, name), 'utf8'); contents.set(name, text); digest.update(name).update(text); }
const dictionary = await fs.readFile(path.join(root, 'src/data/frequency-dictionary/entries.json.gz'));
digest.update(dictionary);
const revision = digest.digest('hex');
try {
  const previous = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
  if (previous.revision === revision) { await fs.access(path.join(output, 'corpus.json.gz')); await fs.access(path.join(output, 'quality-report.json')); console.log('题库词频索引已是最新。'); process.exit(0); }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const require = createRequire(import.meta.url);
const tokenizer = await new Promise((resolve, reject) => kuromoji.builder({ dicPath: path.dirname(require.resolve('kuromoji/dict/base.dat.gz')) }).build((error, result) => error ? reject(error) : resolve(result)));
const dictionaryEntries = JSON.parse(gunzipSync(dictionary));
const referenceEntries = JSON.parse(contents.get('src/data/frequency-levels/entries.json'));
const trustedWords = new Set([...Object.keys(dictionaryEntries), ...referenceEntries.map(([word]) => word)]);
const builder = createFrequencyBuilder(text => tokenizer.tokenize(text), {trustedWords});
let count = 0;
for (const file of files) {
  const paper = JSON.parse(contents.get(`src/data/imported-bank/questions/${file}`));
  for (const question of paper.questions) { builder.addQuestion({ ...question, source: 'imported', period: paper.period }); count++; }
  // Missing media does not prevent text analysis. Preserve these questions but disable their practice links.
  for (const unavailable of paper.unavailable ?? []) {
    const raw = unavailable.raw;
    if (!raw) continue;
    builder.addQuestion({ id: unavailable.id, source: 'imported', period: paper.period, level: paper.level,
      category: { vocabulary: '词汇', grammar: '语法', reading: '阅读', listening: '听力' }[paper.type],
      instruction: raw.bigTitle ?? '', passage: raw.article ?? '', prompt: raw.littleQuestion || raw.question || '',
      sourceQuestionNumber: unavailable.questionNumber ?? null, available: false,
      options: [1, 2, 3, 4].map(i => ({ text: raw[`option${i}`] ?? '' })), explanation: [raw.assistantNew || raw.assistant || ''] });
    count++;
  }
  if (count && count % 1000 < 40) console.log(`已分析约 ${count} 道题……`);
}
const original = JSON.parse(contents.get('src/data/question-bank.json'));
for (const [level, periods] of Object.entries(original.papers)) for (const [period, paper] of Object.entries(periods)) {
  for (const [type, category] of [['vocabulary', '词汇'], ['grammar', '语法'], ['reading', '阅读']]) {
    const questions = type === 'reading' ? paper.reading.questions : paper[type];
    for (const [id, prompt, options, , explanation] of questions) builder.addQuestion({ id, source: 'original', period, level, category, prompt,
      passage: type === 'reading' ? paper.reading.passage : undefined,
      options: options.map(text => ({ text })), explanation: Array.isArray(explanation) ? explanation : [explanation] });
  }
}
const corpus = builder.finish(revision);
const correctedReadings = correctFrequencyReadings(corpus, dictionaryEntries);
annotateFrequencyCorpus(corpus, dictionaryEntries);
const quality = reviewFrequencyCorpus(corpus, {trustedWords, referenceReadings: new Set(referenceEntries.map(([word, reading]) => `${word.normalize('NFKC')}\t${reading}`)), tokenize: text => tokenizer.tokenize(text)});
quality.correctedReadings = correctedReadings;
annotateFrequencyLevels(corpus, referenceEntries, JSON.parse(contents.get('src/data/frequency-levels/source.json')),
  JSON.parse(contents.get('src/data/frequency-levels/expression-entries.json')), JSON.parse(contents.get('src/data/frequency-levels/expression-source.json')));
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'corpus.json.gz'), gzipSync(JSON.stringify(corpus), { level: 9 }));
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(frequencyMetadata(corpus), null, 2) + '\n');
await fs.writeFile(path.join(output, 'quality-report.json'), JSON.stringify(quality, null, 2) + '\n');
console.log('题库词频索引生成完成：', corpus.summary);
