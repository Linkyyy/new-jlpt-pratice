import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import kuromoji from 'kuromoji';
import { createFrequencyBuilder, frequencyMetadata, frequencySubtype, frequencyText, listeningTranscript, queryFrequency, parseFrequencyFilters, defaultFrequencyFilters, parseFrequencyDetailOptions, FrequencyInputError } from '../src/lib/bank-frequency.mjs';

const require = createRequire(import.meta.url);
const tokenizer = await new Promise((resolve, reject) => kuromoji.builder({ dicPath: path.dirname(require.resolve('kuromoji/dict/base.dat.gz')) }).build((error, value) => error ? reject(error) : resolve(value)));
const question = (id, overrides = {}) => ({ id, source: 'imported', period: '202412', level: 'N2', category: '阅读', instruction: '問題10 文章を読んで', prompt: '', passage: '', options: [], explanation: [], ...overrides });
const build = questions => { const builder = createFrequencyBuilder(text => tokenizer.tokenize(text)); questions.forEach(q => builder.addQuestion(q)); return builder.finish('fixture'); };
const query = (corpus, overrides = {}) => queryFrequency(corpus, { ...defaultFrequencyFilters, ...overrides });
const find = (corpus, label, overrides = {}) => query(corpus, { q: label, size: 100, ...overrides }).rows.find(row => row.label === label);

test('visible text removes scripts and ruby readings, decodes full-width text, and preserves paragraph boundaries', () => {
  assert.equal(frequencyText('<p>問題１&nbsp;<ruby>学校<rt>がっこう</rt></ruby></p><p>学生&#x3002;</p><script>evil()</script>'), '問題1 学校\n学生。');
  assert.equal(frequencyText('男：学生です。\n女：はい。'), '学生です。\nはい。');
});
test('listening uses only labelled Japanese original, excluding translated and repeated copies', () => {
  assert.equal(listeningTranscript(['<p>听力原文</p><p>学生が話す。</p><p>听力译文</p><p>学生在说话。</p><p>学生が話す。</p>']), '学生が話す。');
  assert.equal(listeningTranscript(['这里有中文解析。']), '');
  const c = build([question('a', { category: '听力', prompt: '听力第 72 题：请听音频后选择答案。', explanation: ['听力原文\n学生が話す。\n听力译文\n学生が話す。'] })]);
  assert.equal(find(c, '学生').occurrences, 1);
  assert.equal(find(c, '听力'), undefined);
});
test('grammar choice, ordering and passage subtypes are semantic, not tied to varying problem numbers', () => {
  assert.equal(frequencySubtype(question('a', { category: '语法', instruction: '<p>問題７ 次の文の（　）に入れる</p>' })).id, 'grammar-choice');
  assert.equal(frequencySubtype(question('a', { category: '语法', instruction: '問題６ __★__に入る' })).id, 'grammar-order');
  assert.equal(frequencySubtype(question('a', { category: '语法', instruction: '問題３ 次の文章を読んで' })).id, 'grammar-passage');
  assert.notEqual(frequencySubtype(question('a')).id, frequencySubtype(question('b', { level: 'N1' })).id);
  assert.notEqual(frequencySubtype(question('a', { category: '词汇', instruction: '問題３ 入れる' })).id, frequencySubtype(question('b', { category: '词汇', instruction: '問題４ 入れる' })).id);
});
test('shared passages count once, retain subquestion coverage, and stay separate across periods', () => {
  const passage = '学生は本を読む。学生は勉強する。';
  const c = build([question('a', { passage }), question('b', { passage }), question('c', { passage, period: '202407' })]);
  const all = find(c, '学生'); assert.equal(all.occurrences, 4); assert.equal(all.questions, 3); assert.equal(all.papers, 2);
  const single = find(c, '学生', { period: '202412' }); assert.equal(single.occurrences, 2); assert.equal(single.questions, 2);
  assert.equal(c.units.length, 2);
});
test('a shared passage can be filtered by one subtype without dropping or multiplying it', () => {
  const passage = '学生は勉強する。';
  const c = build([question('a', { passage }), question('b', { passage, instruction: '問題11 文章を読んで' })]);
  assert.equal(find(c, '学生').occurrences, 1);
  assert.equal(find(c, '学生', { subtype: c.questions[0][5] }).questions, 1);
});
test('choices remain separate and are never stitched into invented grammar expressions', () => {
  const c = build([question('a', { passage: '学生。', prompt: '学生。', options: [{ text: '学生。' }, { text: '学生。' }, { text: 'わけでは' }, { text: 'ない' }] })]);
  assert.equal(find(c, '学生', { field: 'passage' }).occurrences, 1);
  assert.equal(find(c, '学生', { field: 'options' }).occurrences, 2);
  assert.equal(find(c, '学生', { field: 'prompt' }), undefined); // prompt identical to the passage is inherited duplicate text
  assert.equal(find(c, 'わけではない', { kind: 'grammar' }), undefined);
});
test('word rankings merge inflected forms with the correct lemma reading and omit function words', () => {
  const c = build([question('a', { prompt: '読んだ。読みます。読む。勉強する。123。' })]);
  const row = find(c, '読む'); assert.equal(row.occurrences, 3); assert.equal(row.reading, 'よむ');
  assert.equal(find(c, 'する'), undefined); assert.equal(find(c, '123'), undefined);
  assert.equal(query(c, { q: 'ヨム' }).rows.find(row => row.label === '読む').occurrences, 3);
});
test('longest grammar matches do not double count nested expressions', () => {
  const c = build([question('a', { prompt: 'そういうわけではない。ないわけではない。学生にしては上手だ。' })]);
  assert.equal(find(c, 'わけではない', { kind: 'grammar' }).occurrences, 1);
  assert.equal(find(c, 'ないわけではない', { kind: 'grammar' }).occurrences, 1);
  assert.equal(find(c, 'にしては', { kind: 'grammar' }).occurrences, 1);
});
test('conjunctions do not count identical particle sequences and do not double count POS plus rules', () => {
  const c = build([question('a', { prompt: '学生でも分かる。学生ではない。でも、勉強する。しかし、難しい。' })]);
  assert.equal(find(c, 'でも', { kind: 'connective' }).occurrences, 1);
  assert.equal(find(c, 'では', { kind: 'connective' }), undefined);
  assert.equal(find(c, 'しかし', { kind: 'connective' }).occurrences, 1);
});
test('source, level, category, field and subtype filters combine without cross-bank contamination', () => {
  const c = build([question('a', { prompt: '学生。', level: 'N1', source: 'original', period: '2026', category: '语法', instruction: '問題1 次の文の' }), question('b', { prompt: '学生。', level: 'N2' })]);
  const r = query(c, { source: 'original', level: 'N1', category: 'grammar', subtype: 'grammar-choice', field: 'prompt' });
  assert.equal(r.questionCount, 1); assert.equal(r.rows.find(x => x.label === '学生').occurrences, 1);
  assert.equal(query(c, { level: 'N5' }).total, 0);
});
test('coverage-based ranking, thresholds and pagination return bounded, reproducible results', () => {
  const c = build([question('a', { prompt: '学校。学校。学校。学生。' }), question('b', { prompt: '学生。' })]);
  assert.equal(query(c).rows[0].label, '学校'); assert.equal(query(c, { order: 'questions' }).rows[0].label, '学生');
  assert.equal(query(c, { min: 3 }).total, 1);
  assert.equal(query(c, { size: 1, page: 2 }).rows[0].rank, 2);
  assert.equal(query(c, { size: 1, page: 1000 }).filters.page, 2);
  const id = find(c, '学生').id; const detail = queryFrequency(c, { ...defaultFrequencyFilters }, id).detail;
  assert.equal(detail.examples.length, 2); assert.equal(detail.examples[0].id, 'a');
  assert.equal('answers' in detail, false); assert.equal('passage' in detail, false);
});
test('Japanese alphabetical order follows readings rather than kanji codepoints', () => {
  const c = build([question('a', { prompt: '犬。猫。愛。' })]);
  assert.deepEqual(query(c, { order: 'alphabetical' }).rows.map(row => row.label), ['愛', '犬', '猫']);
});
test('query validation rejects malformed, incompatible and unbounded input', () => {
  const meta = frequencyMetadata(build([question('a', { category: '语法', instruction: '問題1 次の文の' })]));
  for (const raw of ['page=-1', 'size=1000', 'size=1e2', 'min=0', 'level=N9', 'kind=bad', 'field=assistant', 'subtype=grammar-choice&category=reading', 'q=' + 'あ'.repeat(81)]) assert.throws(() => parseFrequencyFilters(new URLSearchParams(raw), meta), FrequencyInputError, raw);
  assert.equal(parseFrequencyFilters(new URLSearchParams('kind=grammar&category=grammar&subtype=grammar-choice'), meta).subtype, 'grammar-choice');
});
test('the production corpus covers every available and unavailable question plus originals with valid postings', () => {
  const c = JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz', import.meta.url))));
  const meta = JSON.parse(fs.readFileSync(new URL('../src/data/bank-frequency/manifest.json', import.meta.url)));
  const manifest = JSON.parse(fs.readFileSync(new URL('../src/data/imported-bank/index.json', import.meta.url)));
  assert.equal(c.questions.length, manifest.report.questions + 90); assert.equal(new Set(c.questions.map(q => q[0])).size, c.questions.length);
  assert.equal(c.revision, meta.revision); assert.equal(c.summary.questions, meta.summary.questions);
  for (const [field, ids, counts] of c.units) {
    assert.ok(['passage', 'prompt', 'options', 'transcript'].includes(field));
    assert.equal(ids.length, new Set(ids).size);
    for (const id of ids) assert.ok(Number.isInteger(id) && id >= 0 && id < c.questions.length);
    assert.equal(counts.length % 2, 0);
    for (let i = 0; i < counts.length; i += 2) { assert.ok(counts[i] < c.terms.length); assert.ok(Number.isInteger(counts[i + 1]) && counts[i + 1] > 0); }
  }
  for (const kind of ['word', 'grammar', 'connective']) {
    const result = query(c, { kind }); assert.ok(result.total > 0); assert.ok(result.rows.length <= 30);
    assert.ok(result.rows.every(row => row.questions <= result.questionCount && row.papers <= result.paperCount));
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 30000);
  }
});


test('every source remains reachable through pagination and a paper filter without duplicate references', () => {
  const c = build(Array.from({ length: 43 }, (_, i) => question(`source-${i}`, { prompt: '学生は本を読む。', period: ['202412', '202407', '202312'][i % 3] })));
  const id = find(c, '学生').id;
  const pages = [1, 2, 3].map(examplePage => queryFrequency(c, defaultFrequencyFilters, id, { examplePage, exampleSize: 20 }).detail);
  assert.deepEqual(pages.map(p => p.examples.length), [20, 20, 3]);
  assert.equal(pages[0].exampleTotal, 43); assert.equal(pages[0].sourcePapers.reduce((sum, p) => sum + p.questions, 0), 43);
  assert.equal(new Set(pages.flatMap(p => p.examples.map(q => q.id))).size, 43);
  const paper = pages[0].sourcePapers[1];
  const detail = queryFrequency(c, defaultFrequencyFilters, id, { examplePaper: paper.id, exampleSize: 50 }).detail;
  assert.equal(detail.exampleTotal, paper.questions);
  assert.ok(detail.examples.every(q => q.period === paper.period && q.fields.includes('prompt')));
  for (const raw of ['examplePage=0','exampleSize=51','examplePaper=-1','examplePaper=999999']) assert.throws(() => parseFrequencyDetailOptions(new URLSearchParams(raw), c), FrequencyInputError);
});
test('occurrence ascending/descending and full exports keep the same filtered rows and correct ranks', () => {
  const c = build([question('a', { prompt: '学生。学校。学校。学校。' })]);
  assert.equal(query(c).rows[0].label, '学校');
  assert.equal(query(c, { order: 'occurrences-asc' }).rows[0].label, '学生');
  const all = queryFrequency(c, { ...defaultFrequencyFilters, size: 1, page: 2, order: 'occurrences-asc' }, undefined, { allRows: true });
  assert.equal(all.rows.length, all.total); assert.deepEqual(all.rows.map(row => row.rank), [1, 2]);
  assert.equal(all.rows[0].label, '学生');
});
