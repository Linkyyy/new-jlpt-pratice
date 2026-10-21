import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import kuromoji from 'kuromoji';
import { createFrequencyBuilder, frequencyMetadata, frequencySubtype, frequencyText, listeningTranscript, queryFrequency, parseFrequencyFilters, defaultFrequencyFilters, parseFrequencyDetailOptions, FrequencyInputError } from '../src/lib/bank-frequency.mjs';
import { annotateFrequencyCorpus } from '../src/lib/frequency-definitions.mjs';
import { grammarExpressions, connectiveExpressions } from '../src/lib/frequency-lexicon.mjs';
import { grammarStudyNotes, connectiveStudyNotes } from '../src/lib/frequency-study-notes.mjs';
import { createIdiomMatcher, idiomEntries, idiomStudyNotes } from '../src/lib/frequency-idioms.mjs';

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
test('idioms merge inflections and spelling variants even when the tokenizer changes segmentation', () => {
  const c = build([question('idioms', { prompt: 'この店が気に入った。新しい服も気に入ります。気に入らない。気がついた。気が付きました。腹が立った。腹が立ちます。歯が立たなかった。頭が上がらなかった。' })]);
  assert.deepEqual(query(c, { kind: 'idiom' }).rows.map(row => [row.label, row.occurrences]).sort(), [
    ['気に入る', 3], ['気が付く', 2], ['腹が立つ', 2], ['歯が立たない', 1], ['頭が上がらない', 1],
  ].sort());
  assert.equal(find(c, '気がつく', { kind: 'idiom' }), undefined);
  assert.equal(find(c, '気に入る', { kind: 'idiom' }).reading, 'きにいる');
});
test('idioms require whole consecutive tokens and never join sentences, paragraphs, or separate choices', () => {
  const c = build([question('boundaries', { prompt: '気に。入る。気にとても入る。気に入り口。気が\n付く。影響を与える。責任を負う。', options: [{ text: '気に' }, { text: '入った' }] })]);
  assert.equal(query(c, { kind: 'idiom' }).total, 0);
  const distinct = build([question('choices', { options: [{ text: '目を通した。' }, { text: '目を通す。' }] })]);
  assert.equal(find(distinct, '目を通す', { kind: 'idiom', field: 'options' }).occurrences, 2);
});
test('all curated idiom forms resolve once to their canonical headword with authored meaning and usage', () => {
  const match = createIdiomMatcher(text => tokenizer.tokenize(text));
  assert.equal(new Set(idiomEntries.map(entry => entry.label)).size, idiomEntries.length);
  for (const { label, forms } of idiomEntries) {
    assert.ok(idiomStudyNotes[label]?.meaning && idiomStudyNotes[label]?.usage, label);
    for (const form of forms) assert.deepEqual(match(tokenizer.tokenize(form)), [label], form);
  }
});
test('idiom occurrences deduplicate shared passages and transcripts while keeping every original question reference', () => {
  const c = annotateFrequencyCorpus(build([
    question('a', { passage: '先に資料に目を通した。' }), question('b', { passage: '先に資料に目を通した。' }),
    question('c', { period: '202407', category: '听力', explanation: ['听力原文\n資料に目を通す。\n听力译文\n看一遍资料。'] }),
  ]), {});
  const row = find(c, '目を通す', { kind: 'idiom' });
  assert.equal(row.occurrences, 2); assert.equal(row.questions, 3); assert.equal(row.papers, 2);
  assert.equal(find(c, row.label, { kind: 'idiom', field: 'passage' }).occurrences, 1);
  assert.equal(find(c, row.label, { kind: 'idiom', category: 'listening', field: 'transcript' }).occurrences, 1);
  const detail = queryFrequency(c, { ...defaultFrequencyFilters, kind: 'idiom' }, row.id).detail;
  assert.deepEqual(detail.examples.map(example => example.id).sort(), ['a', 'b', 'c']);
  assert.equal(detail.definition.source, 'editorial'); assert.match(detail.definition.meaning, /过目/); assert.match(detail.definition.usage, /资料/);
});
test('idiom exclusive scopes compare canonical expressions across all text and banks, independently of component words', () => {
  const c = build([
    question('upper', { source: 'original', level: 'N1', prompt: 'この店が気に入った。資料に目を通す。' }),
    question('lower', { level: 'N5', options: [{ text: '気に入ります。目。通す。' }] }),
  ]);
  const filters = parseFrequencyFilters(new URLSearchParams('kind=idiom&exclusive=N1&source=original&field=prompt'), frequencyMetadata(c));
  assert.equal(filters.kind, 'idiom');
  assert.deepEqual(queryFrequency(c, filters).rows.map(row => row.label), ['目を通す']);
  assert.ok(find(c, '気に入る', { ...filters, exclusive: 'all' }));
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
  for (const kind of ['word', 'grammar', 'idiom', 'connective']) {
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

test('exclusive scopes subtract all lower levels while retaining words shared by eligible upper levels', () => {
  const c = build([
    question('n1', { level: 'N1', prompt: '学校。抽象。抽象。懸念。' }),
    question('n2', { level: 'N2', prompt: '学校。抽象。提案。' }),
    question('n3', { level: 'N3', prompt: '学校。提案。' }),
    question('n4', { level: 'N4', prompt: '学校。' }),
    question('n5', { level: 'N5', prompt: '学校。' }),
  ]);
  assert.ok(find(c, '学校', { level: 'N1' })); // Existing per-paper level filtering stays unchanged.
  assert.deepEqual(query(c, { exclusive: 'N1' }).rows.map(r => r.label), ['懸念']);
  const n2 = query(c, { exclusive: 'N2' });
  assert.deepEqual(n2.rows.map(r => [r.label, r.occurrences]), [['抽象', 3], ['懸念', 1]]);
  assert.equal(n2.questionCount, 2); assert.equal(n2.paperCount, 2);
  assert.equal(find(c, '抽象', { exclusive: 'N2', level: 'N2' }).occurrences, 1);
  assert.equal(find(c, '提案', { exclusive: 'N2' }), undefined);
  assert.ok(find(c, '提案', { exclusive: 'N3' }));
  assert.equal(find(c, '学校', { exclusive: 'N4' }), undefined);
  const id = find(c, '抽象', { exclusive: 'N2' }).id;
  const detail = queryFrequency(c, { ...defaultFrequencyFilters, exclusive: 'N2' }, id).detail;
  assert.deepEqual(new Set(detail.examples.map(q => q.level)), new Set(['N1', 'N2']));
  const excluded = find(c, '学校').id;
  assert.equal(queryFrequency(c, { ...defaultFrequencyFilters, exclusive: 'N1' }, excluded).detail, null);
});

test('lower-level comparison ignores current bank, date, subtype and field filters, including unavailable resources', () => {
  const c = build([
    question('upper', { source: 'original', level: 'N1', category: '语法', instruction: '問題1 次の文の', prompt: '学生。学校。読んだ。懸念。' }),
    question('lower-a', { period: '201007', level: 'N5', category: '听力', explanation: ['听力原文\n学生は読む。'] }),
    question('lower-b', { period: '201407', level: 'N4', available: false, options: [{ text: '学校。' }] }),
  ]);
  const filters = { exclusive: 'N1', source: 'original', period: '202412', category: 'grammar', subtype: 'grammar-choice', field: 'prompt', pos: '名词' };
  assert.deepEqual(query(c, filters).rows.map(r => r.label), ['懸念']);
  assert.equal(find(c, '読む', { ...filters, pos: 'all' }), undefined);
  assert.ok(find(c, '学生', { ...filters, exclusive: 'all' }));
});

test('lower-level lemma presence crosses POS tags, while word and expression inventories remain separate', () => {
  const c = build([question('upper', { level: 'N1', prompt: '学生。' }), question('lower', { level: 'N5', prompt: '学生。' })]);
  const duplicate = c.terms.length;
  c.terms.push(['学生', 'がくせい', '副词', 'word']);
  c.units.find(unit => unit[1].includes(1))[2] = [duplicate, 1];
  assert.equal(find(c, '学生', { exclusive: 'N1', pos: '名词' }), undefined);
  assert.ok(find(c, '学生', { pos: '名词' }));
  const expressions = build([
    question('n1', { level: 'N1', prompt: '学生にしては上手だ。しかし、学校。' }),
    question('n2', { level: 'N2', prompt: 'しかし、学校。' }),
  ]);
  assert.ok(find(expressions, 'にしては', { exclusive: 'N1', kind: 'grammar' }));
  assert.equal(find(expressions, 'しかし', { exclusive: 'N1', kind: 'connective' }), undefined);
});

test('exclusive parameters validate scope/level compatibility and exported rows retain the same difference', () => {
  const c = build([question('n1', { level: 'N1', prompt: '抽象。懸念。' }), question('n2', { level: 'N2', prompt: '抽象。' }), question('n5', { level: 'N5', prompt: '学校。' })]);
  const metadata = frequencyMetadata(c);
  for (const raw of ['exclusive=N0', 'exclusive=N5', 'exclusive=bad', 'exclusive=N1&level=N2', 'exclusive=N1&subtype=reading-N5-10']) {
    assert.throws(() => parseFrequencyFilters(new URLSearchParams(raw), metadata), FrequencyInputError, raw);
  }
  const filters = parseFrequencyFilters(new URLSearchParams('exclusive=N2&level=N1&size=1&page=2&order=occurrences-asc'), metadata);
  const page = queryFrequency(c, filters);
  const all = queryFrequency(c, filters, undefined, { allRows: true });
  assert.equal(page.filters.exclusive, 'N2');
  assert.equal(all.total, 2); assert.equal(all.rows.length, 2);
  assert.deepEqual(all.rows.map(row => row.rank), [1, 2]);
  assert.equal(query(c, { exclusive: 'N1', q: '学校' }).total, 0);
});

test('every production exclusive result is absent from all excluded levels, across every inventory', () => {
  const c = JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz', import.meta.url))));
  for (const exclusive of ['N1', 'N2', 'N3', 'N4']) {
    const excluded = new Set();
    for (const [, ids, counts] of c.units) {
      if (!ids.some(id => Number(c.questions[id][2].slice(1)) > Number(exclusive.slice(1)))) continue;
      for (let i = 0; i < counts.length; i += 2) { const term = c.terms[counts[i]]; excluded.add(`${term[3]}:${term[0]}`); }
    }
    for (const kind of ['word', 'grammar', 'idiom', 'connective']) {
      const result = queryFrequency(c, { ...defaultFrequencyFilters, exclusive, kind }, undefined, { allRows: true });
      assert.ok(result.rows.every(row => !excluded.has(`${kind}:${row.label}`)));
      if (kind === 'word') assert.ok(result.total > 0);
    }
  }
});

test('official item categories distinguish N2 word formation from context and reading types across levels', () => {
  const type = (level, category, number) => frequencySubtype(question('official', {level, category, instruction: `問題${number} 次のものを選んでください。`}));
  assert.equal(type('N2', '词汇', 3).id, 'vocabulary-formation');
  assert.equal(type('N2', '词汇', 4).id, 'vocabulary-context');
  assert.equal(type('N1', '词汇', 2).id, 'vocabulary-context');
  assert.equal(type('N3', '词汇', 3).id, 'vocabulary-context');
  for (const [level, start, expected] of [
    ['N1',8,['short','medium','long','integrated','thematic','information']],
    ['N2',10,['short','medium','integrated','thematic','information']],
    ['N3',4,['short','medium','long','information']],
    ['N4',4,['short','medium','information']],
    ['N5',4,['short','medium','information']],
  ]) assert.deepEqual(expected.map((_, i) => type(level, '阅读', start + i).id), expected.map(name => `reading-${name}`));
  assert.equal(type('N1', '阅读', 8).id, type('N2', '阅读', 10).id);
  assert.equal(frequencySubtype(question('unknown', {source:'original', instruction:'', prompt:'これは例です。'})).id, 'reading-other');
});

test('official listening categories respect N1/N2 versus N3/N4/N5 differences', () => {
  for (const [level, names] of [
    ['N1',['task','point','gist','response','integrated']],
    ['N2',['task','point','gist','response','integrated']],
    ['N3',['task','point','gist','expression','response']],
    ['N4',['task','point','expression','response']],
    ['N5',['task','point','expression','response']],
  ]) {
    assert.deepEqual(names.map((_, i) => frequencySubtype(question('l', {level, category:'听力', instruction:`問題${i+1} 聞いてください。`})).id), names.map(name => `listening-${name}`));
  }
  const meta = frequencyMetadata(build([question('n1',{level:'N1'})]));
  for (const raw of ['level=N1&subtype=listening-expression','level=N2&subtype=reading-long','level=N3&subtype=vocabulary-formation']) {
    const complete = {...meta, levels:['N1','N2','N3','N4','N5']};
    assert.throws(() => parseFrequencyFilters(new URLSearchParams(raw), complete), FrequencyInputError);
  }
});

test('conjunctions are included under words, filter by POS, and old third-tab links resolve to that filter', () => {
  const c = build([question('a',{prompt:'しかし、学生は勉強する。そして、学校へ行く。'})]);
  assert.equal(find(c,'しかし').pos,'接续词');
  assert.deepEqual(query(c,{pos:'接续词'}).rows.map(row=>row.label).sort(),['しかし','そして']);
  assert.equal(find(c,'しかし',{pos:'名词'}),undefined);
  const filters=parseFrequencyFilters(new URLSearchParams('kind=connective'),frequencyMetadata(c));
  assert.equal(filters.kind,'word');assert.equal(filters.pos,'接续词');
  assert.deepEqual(queryFrequency(c,filters).rows.map(row=>row.label).sort(),['しかし','そして']);
});

test('definitions preserve Chinese meanings, usage and attribution without guessing missing words or homophone readings', () => {
  const c = build([question('a',{prompt:'学生にしては上手だ。しかし、猫。霞。学校。'})]);
  annotateFrequencyCorpus(c,{
    '学生':[{word:'学生',pos:'noun',readings:['がくせい'],glosses:['學生；在學校學習的人']}],
    '猫':[{word:'猫',pos:'noun',readings:['ねこ'],glosses:['猫；家猫']}],
    '霞':[{word:'霞',pos:'noun',readings:['べつのよみ'],glosses:['不该用于这个读音的释义']}],
  });
  const student=find(c,'学生');assert.equal(student.definition.meaning,'學生；在學校學習的人');assert.equal(student.definition.source,'wiktionary');assert.equal(student.definition.word,'学生');
  assert.equal(find(c,'猫').definition.meaning,'猫；家猫');
  assert.equal(find(c,'霞').definition.source,'missing');assert.equal(find(c,'霞').definition.meaning,'');
  const grammar=find(c,'にしては',{kind:'grammar'});assert.match(grammar.definition.meaning,/就/);assert.match(grammar.definition.usage,/名词/);
  assert.equal(find(c,'しかし').definition.source,'editorial');
  const detail=queryFrequency(c,defaultFrequencyFilters,student.id).detail;assert.deepEqual(detail.definition,student.definition);
});

test('every grammar and listed conjunction has a meaning and usage; opposite grammar senses stay separate', () => {
  for(const [label] of grammarExpressions){assert.ok(grammarStudyNotes[label]?.meaning,label);assert.ok(grammarStudyNotes[label]?.usage,label)}
  for(const [label] of connectiveExpressions){assert.ok(connectiveStudyNotes[label]?.meaning,label);assert.ok(connectiveStudyNotes[label]?.usage,label)}
  const c=annotateFrequencyCorpus(build([question('a',{prompt:'雨にもかかわらず出かける。年齢にかかわらず参加できる。'})]),{});
  assert.match(find(c,'にもかかわらず',{kind:'grammar'}).definition.meaning,/尽管/);
  assert.match(find(c,'にかかわらず',{kind:'grammar'}).definition.meaning,/不论/);
});

test('Chinese UI placeholder prompts are not Japanese vocabulary and the generated corpus contains aligned definitions',()=>{
  const c=build([question('a',{prompt:'请选择第 48 题的答案（对应文章或音频中的题号）。',options:[{text:'学校'}]})]);
  assert.equal(find(c,'题'),undefined);assert.equal(find(c,'学校').occurrences,1);
  const actual=JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz',import.meta.url))));
  assert.equal(actual.definitions.length,actual.terms.length);
  assert.equal(actual.definitionSummary.matched+actual.definitionSummary.missing,actual.terms.length);
  for(let i=0;i<actual.terms.length;i++)if(['grammar','idiom'].includes(actual.terms[i][3]))assert.ok(actual.definitions[i].meaning&&actual.definitions[i].usage,actual.terms[i][0]);
  assert.ok(find(actual,'学生').definition.meaning);
});
