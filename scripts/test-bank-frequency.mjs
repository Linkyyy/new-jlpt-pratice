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
import { reviewFrequencyCorpus, correctFrequencyReadings } from '../src/lib/frequency-quality.mjs';
import { annotateFrequencyCompounds, annotateFrequencySupplements } from '../src/lib/frequency-review.mjs';
import { annotateFrequencyLevels } from '../src/lib/frequency-levels.mjs';
import { simplifiedDefinition } from '../src/lib/frequency-simplified.mjs';
import { mergeFrequencyWordVariants } from '../src/lib/frequency-variants.mjs';
import { frequencySort, frequencyOrders } from '../src/lib/bank-frequency.mjs';
import { supplementalWordEntries, findSupplementalWordNote } from '../src/lib/frequency-word-supplements.mjs';

const require = createRequire(import.meta.url);
const tokenizer = await new Promise((resolve, reject) => kuromoji.builder({ dicPath: path.dirname(require.resolve('kuromoji/dict/base.dat.gz')) }).build((error, value) => error ? reject(error) : resolve(value)));
const question = (id, overrides = {}) => ({ id, source: 'imported', period: '202412', level: 'N2', category: '阅读', instruction: '問題10 文章を読んで', prompt: '', passage: '', options: [], explanation: [], ...overrides });
const build = questions => { const builder = createFrequencyBuilder(text => tokenizer.tokenize(text), {trustedWords: new Set(['ぎじゅつ'])}); questions.forEach(q => builder.addQuestion(q)); return builder.finish('fixture'); };
const query = (corpus, overrides = {}) => queryFrequency(corpus, { ...defaultFrequencyFilters, ...overrides });
const find = (corpus, label, overrides = {}) => query(corpus, { q: label, size: 100, ...overrides }).rows.find(row => row.label === label);

test('katakana filtering recognizes full/half-width headwords but excludes kanji with katakana aliases, preserving grammatical POS', () => {
  const terms = [
    ['コンピューター', 'こんぴゅーたー', '名词', 'word'], ['ｺｰﾋｰ', 'こーひー', '名词', 'word'],
    ['パーティー', 'ぱーてぃー', '名词', 'word'], ['ケース・スタディー', 'けーす・すたでぃー', '名词', 'word'],
    ['図書館', 'としょかん', '名词', 'word'], ['かたかな', 'かたかな', '名词', 'word'],
    ['片仮名', 'かたかな', '名词', 'word'], ['ー・', '', '名词', 'word'],
    ['CDプレーヤー', 'しーでぃーぷれーやー', '名词', 'word'], ['テスト', '', '语法表达', 'grammar'],
  ];
  const c = {terms, aliases: terms.map((_, id) => id === 6 ? ['カタカナ'] : []),
    questions: [['test','imported','N1','202412','vocabulary','test',1,true,0]], papers: [['imported','N1','202412']],
    units: [['prompt',[0],terms.flatMap((_, id) => [id, id + 1])]], subtypes:[], summary:{}, version:1, revision:'test'};
  const filters = parseFrequencyFilters(new URLSearchParams({pos:'片假名词'}), frequencyMetadata(c));
  const rows = queryFrequency(c, filters).rows;
  assert.deepEqual(new Set(rows.map(row => row.label)), new Set(['コンピューター','ｺｰﾋｰ','パーティー','ケース・スタディー']));
  assert.ok(rows.every(row => row.pos === '名词'));
  assert.deepEqual(query(c,{pos:'片假名词',max:2}).rows.map(row => row.label),['ｺｰﾋｰ','コンピューター']);
  assert.equal(query(c,{pos:'名词'}).total,9);
});

test('mimetic filter is an additional whole-word classification: user examples and writing variants retain their POS and counts', () => {
  const terms = [
    ['わざわざ','わざわざ','副词','word'], ['めそめそ','めそめそ','副词','word'],
    ['そわそわ','そわそわ','副词','word'], ['じっくり','じっくり','副词','word'],
    ['ソワソワ','そわそわ','副词','word'], ['ｶﾞﾗｶﾞﾗ','がらがら','名词','word'],
    ['態々','わざわざ','副词','word'], ['仮の表記','','副词','word'],
    ['いろいろ','いろいろ','副词','word'], ['時々','ときどき','副词','word'],
    ['めそ','めそ','副词','word'], ['わざわざ追加','わざわざついか','名词','word'],
    ['じっくり','じっくり','语法表达','grammar'],
  ];
  const c={terms,aliases:terms.map((_,i)=>i===7?['ジックリ']:[]),
    questions:[['test','imported','N1','202412','vocabulary','test',1,true,0]],papers:[['imported','N1','202412']],
    units:[['prompt',[0],terms.flatMap((_,i)=>[i,i+1])]],subtypes:[],summary:{},version:1,revision:'test'};
  const before=JSON.stringify(c),filters=parseFrequencyFilters(new URLSearchParams({pos:'拟声拟态词'}),frequencyMetadata(c)),filtered=queryFrequency(c,filters);
  assert.deepEqual(new Set(filtered.rows.map(row=>row.id)),new Set([0,1,2,3,4,5,6,7]));
  for(const row of filtered.rows){assert.equal(row.mimetic,true);assert.equal(row.pos,terms[row.id][2]);assert.deepEqual(row.partsOfSpeech,[terms[row.id][2]]);assert.equal(row.occurrences,row.id+1);}
  assert.equal(query(c,{pos:'副词'}).rows.filter(row=>row.mimetic).length,7);
  assert.equal(query(c,{pos:'名词'}).rows.find(row=>row.label==='ｶﾞﾗｶﾞﾗ').mimetic,true);
  assert.deepEqual(new Set(query(c,{pos:'拟声拟态词',min:3,max:4}).rows.map(row=>row.label)),new Set(['そわそわ','じっくり']));
  assert.equal(query(c,{kind:'grammar'}).rows[0].mimetic,false);
  assert.equal(JSON.stringify(c),before);
});

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
  const transcripts=JSON.parse(fs.readFileSync(new URL('../src/data/frequency-listening/index.json',import.meta.url)));
  assert.equal(c.questions.length, manifest.report.questions + 90 + transcripts.questionCount); assert.equal(new Set(c.questions.map(q => q[0])).size, c.questions.length);
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
  const student=find(c,'学生');assert.equal(student.definition.meaning,'学生；在学校学习的人');assert.equal(student.definition.source,'wiktionary');assert.equal(student.definition.word,'学生');
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

test('legacy Japanese POS markers do not discard existing Chinese dictionary meanings', () => {
  const terms = [
    ['表現', 'ひょうげん', '表現【ひょうげん】\n名·他サ 表现。', '表现。'],
    ['申請', 'しんせい', '申請【しんせい】\n名·他サ 申请。', '申请。'],
    ['集中', 'しゅうちゅう', '?自他サ 集中。', '集中。'],
    ['重視', 'じゅうし', '重視【じゅうし】\n名?他サ 重视。', '重视。'],
    ['細密', 'さいみつ', '細密【さいみつ】\n名.形动 细致，精密。\n細密な計画', '细致，精密。'],
  ];
  const c = {terms: terms.map(([label, reading]) => [label, reading, '名词', 'word'])};
  annotateFrequencyCorpus(c, Object.fromEntries(terms.map(([word, reading, gloss]) => [word, [{word, pos: 'unknown', readings: [reading], glosses: [gloss]}]])));
  terms.forEach(([, , , expected], index) => {
    assert.equal(c.definitions[index].meaning, expected);
    assert.equal(c.definitions[index].source, 'wiktionary');
  });
});

test('a source variant gloss uses its supplied Chinese meaning without inventing a translation from the reference', () => {
  const c = {terms: [['棲む','すむ','动词','word'], ['未収録語','みしゅうろくご','名词','word']]};
  annotateFrequencyCorpus(c, {
    '棲む': [{word:'棲む', pos:'verb', readings:['すむ'], glosses:['住む (“棲息、生存”)的另一種寫法']}],
    '未収録語': [{word:'未収録語', pos:'noun', readings:['みしゅうろくご'], glosses:['かなだけの語 (kana)的另一種寫法']}],
  });
  assert.equal(c.definitions[0].meaning, '栖息、生存');
  assert.equal(c.definitions[0].source, 'wiktionary');
  assert.equal(c.definitions[0].word, '棲む');
  assert.equal(c.definitions[1].source, 'missing');
});

test('common missing vocabulary, polite expressions and potential verbs have Chinese definitions and clear expression usage', () => {
  const labels = [['当たり前','あたりまえ'],['歯','は'],['もうすぐ','もうすぐ'],['話しかける','はなしかける'],['選べる','えらべる'],['ご存じ','ごぞんじ'],['というのも','というのも']];
  const c = {terms: labels.map(([label, reading]) => [label, reading, '名词', 'word'])};
  annotateFrequencyCorpus(c, {});
  assert.deepEqual(c.definitions.map(row => row.source), labels.map(() => 'editorial'));
  assert.deepEqual(c.definitions.slice(0, 5).map(row => row.meaning), ['理所当然；普通；平常','牙齿；齿状部分','马上；不久就……','向……搭话','可以选择']);
  assert.match(c.definitions[4].usage, /可能形式/);
  assert.match(c.definitions[5].usage, /尊敬/);
  assert.match(c.definitions[6].usage, /理由/);
});

test('word notes also cover conjunction-tagged rows without losing dedicated conjunction usage', () => {
  const c = build([question('expressions', {prompt:'いや、まずは勉強する。それと、休む。しかし、続ける。'})]);
  annotateFrequencyCorpus(c, {});
  for (const word of ['いや','まずは','それと','しかし']) assert.ok(find(c, word).definition.meaning, word);
  assert.equal(find(c, 'しかし').pos, '接续词');
  assert.ok(find(c, 'しかし').definition.usage);
});

test('reviewed supplements require the exact headword and reading and never translate unknown fragments by resemblance', () => {
  assert.equal(new Set(supplementalWordEntries.map(row => row.label)).size, supplementalWordEntries.length);
  for (const entry of supplementalWordEntries) {
    assert.ok(entry.meaning && entry.readings.length, entry.label);
    assert.ok(entry.readings.every(reading => reading && !/\s/.test(reading)), entry.label);
    assert.ok(findSupplementalWordNote(entry.label, entry.readings[0]), entry.label);
    assert.equal(findSupplementalWordNote(entry.label, 'べつのよみ'), null, entry.label);
  }
  assert.equal(findSupplementalWordNote('話しかける','はなしかける').meaning, '向……搭话');
  for (const label of ['ぎじゅつを','ゃってください','選へる','話しかけるx','未知の人名']) assert.equal(findSupplementalWordNote(label,label), null);
  const homonym = annotateFrequencyCorpus({terms:[['案','つくえ','名词','word'],['海','かい','名词','word']]}, {});
  assert.ok(homonym.definitions.every(row => row.source === 'missing'));
});

test('production Chinese definitions cover over ninety percent of indexed terms and retain the source detail', () => {
  const c=JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz', import.meta.url))));
  assert.ok(c.definitionSummary.matched / c.definitionSummary.total > 0.9);
  for (const label of ['表現','申請','当たり前','歯','もうすぐ','話しかける','選べる','ご存じ','というのも']) {
    const row=find(c,label); assert.ok(row?.definition.meaning,label);
    assert.deepEqual(queryFrequency(c,defaultFrequencyFilters,row.id).detail.definition,row.definition,label);
  }
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


test('unknown kana chunks and listening placeholders are excluded without deleting real Japanese or source questions', () => {
  const c = build([question('fragment', {prompt: 'ぎじゅつを向上させるため。しょうがっこうにいく。きょうしつのじゅんびをする。雲。歯。あいまい。ぎじゅつ。', options: [{text: '选项 1（以音频为准）'}, {text: '学生。'}]})]);
  assert.equal(c.questions.length, 1);
  for (const label of ['ぎじゅつを', 'ょうがっこうにいく', 'ょうしつのじゅんびをする', '选项', '音频']) assert.equal(find(c, label), undefined, label);
  for (const label of ['向上', '雲', '歯', 'あいまい', 'ぎじゅつ', '学生']) assert.ok(find(c, label), label);
  assert.ok(c.summary.excludedFragments >= 3);
});
test('Chinese definitions become simplified while Japanese examples, headwords, and dictionary links stay Japanese', () => {
  assert.equal(simplifiedDefinition('學習；練習；用於「勉強する」；「學習」的意思'), '学习；练习；用于「勉強する」；「學習」的意思');
  const c = annotateFrequencyCorpus({terms: [['図書館', 'としょかん', '名词', 'word']]}, {'図書館': [{word: '図書館', readings: ['としょかん'], pos: 'noun', glosses: ['圖書館；收藏書籍供人閱讀的場所']}]});
  assert.equal(simplifiedDefinition('「世話」的禮貌說法'), '「世話」的礼貌说法');
  assert.equal(c.terms[0][0], '図書館'); assert.equal(c.definitions[0].word, '図書館');
  assert.equal(c.definitions[0].meaning, '图书馆；收藏书籍供人阅读的场所');
});
test('reference grades match exact spellings/readings and remain independent of exam levels and lower-level differences', () => {
  const c = build([question('n1', {level: 'N1', prompt: '学生。曖昧。'}), question('n3', {level: 'N3', prompt: '学生。曖昧。'}), question('orig', {source: 'original', level: 'N1', prompt: '学生。曖昧。'})]);
  annotateFrequencyLevels(c, [['学生', 'がくせい', 'N5'], ['曖昧', 'あいまい', 'N2'], ['学生', 'なまいき', 'N1']], {name: 'fixture'});
  const result = query(c, {grade: 'N2', level: 'N1'});
  assert.deepEqual(result.rows.map(row => row.label), ['曖昧']); assert.equal(result.rows[0].questions, 1);
  assert.deepEqual(result.rows[0].referenceLevels, ['N2']);
  assert.equal(query(c, {grade: 'N2', level: 'N3'}).rows[0].label, '曖昧');
  assert.equal(query(c, {grade: 'N1'}).total, 0);
  assert.deepEqual(find(c, '学生').referenceLevels, ['N5']);
  const detail = queryFrequency(c, {...defaultFrequencyFilters, grade: 'N2', level: 'N1'}, result.rows[0].id).detail;
  assert.deepEqual(detail.examples.map(row => row.id), ['n1']); assert.deepEqual(detail.referenceLevels, ['N2']);
  assert.throws(() => parseFrequencyFilters(new URLSearchParams('grade=official'), frequencyMetadata(c)), FrequencyInputError);
  assert.equal(parseFrequencyFilters(new URLSearchParams('grade=N2&kind=grammar'), frequencyMetadata(c)).kind, 'grammar');
});
test('every sorting metric can reverse direction without switching to occurrence sorting', () => {
  const c = build([question('one', {prompt: '学校。学校。学校。学生。'}), question('two', {period: '202407', prompt: '学生。'})]);
  for (const order of frequencyOrders) {
    const descriptor = frequencySort(order);
    const reversed = frequencySort(descriptor.next);
    assert.equal(reversed.metric, descriptor.metric); assert.equal(reversed.ascending, !descriptor.ascending);
    assert.equal(reversed.next, order);
    const rows = query(c, {order}).rows;
    if (descriptor.metric !== 'label') for (let i = 1; i < rows.length; i++) assert.ok((rows[i][descriptor.metric] - rows[i - 1][descriptor.metric]) * (descriptor.ascending ? 1 : -1) >= 0, order);
  }
  assert.equal(query(c, {order: 'questions'}).rows[0].label, '学生');
  assert.equal(query(c, {order: 'questions-asc'}).rows[0].label, '学校');
  assert.equal(query(c, {order: 'papers'}).rows[0].label, '学生');
  assert.equal(query(c, {order: 'papers-asc'}).rows[0].label, '学校');
});


test('quality review removes screenshot artifacts, unverified spellings and names, and remaps postings without changing questions', () => {
  const labels = ['!」「〇〇', ')〇〇', '々:', '々(', 'ージー', 'ード', 'イペント', '学生', '雲', '田中', '東京', 'Tシャツ', 'にしては', '気に入る', '寛大'];
  const c = {revision:'quality-fixture', terms: labels.map(label => [label, '', '名词', label === 'にしては' ? 'grammar' : label === '気に入る' ? 'idiom' : 'word']),
    definitions: labels.map(label => ({meaning: ['学生','雲','田中','東京','Tシャツ','にしては','気に入る'].includes(label) ? label : '', usage:'',source:label === 'にしては' || label === '気に入る' ? 'editorial' : 'wiktionary'})),
    referenceLevels: labels.map(() => []), questions:[['a','imported','N2','202412','reading','r',1,true,0]], units:[['prompt',[0],labels.flatMap((_,i)=>[i,i+1])]], summary:{terms:labels.length}};
  const questions=JSON.stringify(c.questions);
  const report=reviewFrequencyCorpus(c,{trustedWords:new Set(['寛大']), referenceReadings:new Set(), tokenize:label=>[{surface_form:label,pos_detail_1:label === '田中'?'固有名詞':'一般',pos_detail_2:'人名'}]});
  assert.equal(JSON.stringify(c.questions),questions);assert.equal(report.excludedTerms,8);
  assert.deepEqual(c.terms.map(t=>t[0]),['学生','雲','東京','Tシャツ','にしては','気に入る','寛大']);
  assert.equal(c.definitions.length,c.terms.length);assert.equal(c.referenceLevels.length,c.terms.length);assert.equal(c.definitionSummary.missing,1);
  assert.deepEqual(c.units[0][2],[0,8,1,9,2,11,3,12,4,13,5,14,6,15]);
  assert.ok(report.excluded.every(row=>row.examples[0]==='a'&&row.occurrences>0));
  assert.ok(report.excluded.some(row=>row.label==='田中'&&row.reason==='personal_or_organization_name'));
  assert.ok(c.terms.some(row=>row[0]==='寛大')); // A missing Chinese gloss alone never deletes a verified headword.
});
test('grammar and idiom levels use whole expressions, support ungraded, and never inherit component-word grades', () => {
  const c=build([question('expressions',{level:'N1',prompt:'学生にしては上手だ。この店が気に入る。気をつける。気が付く。'})]);
  annotateFrequencyLevels(c,[['気に入る','きにいる','N3'],['気をつける','きをつける','N2'],['気','き','N5'],['付く','つく','N4']], {name:'vocab'}, [{kind:'grammar',label:'にしては',level:'N2',sourceId:'ni-shite-wa'}],{name:'grammar'});
  assert.deepEqual(query(c,{kind:'grammar',grade:'N2'}).rows.map(r=>r.label),['にしては']);
  assert.deepEqual(query(c,{kind:'idiom',grade:'N3'}).rows.map(r=>r.label),['気に入る']);
  assert.deepEqual(query(c,{kind:'idiom',grade:'N2'}).rows.map(r=>r.label),['気を付ける']);
  assert.equal(query(c,{kind:'idiom',grade:'N4'}).total,0);
  assert.deepEqual(query(c,{kind:'idiom',grade:'ungraded'}).rows.map(r=>r.label),['気が付く']);
  assert.ok(query(c,{kind:'grammar',grade:'ungraded'}).rows.every(r=>r.referenceLevels.length===0));
  assert.equal(parseFrequencyFilters(new URLSearchParams('kind=idiom&grade=ungraded'),frequencyMetadata(c)).grade,'ungraded');
});
test('the rebuilt production index excludes audited artifacts from every query and retains aligned sourced expression grades', () => {
  const c=JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz',import.meta.url))));
  const report=JSON.parse(fs.readFileSync(new URL('../src/data/bank-frequency/quality-report.json',import.meta.url)));
  const bank=JSON.parse(fs.readFileSync(new URL('../src/data/imported-bank/index.json',import.meta.url)));
  const transcripts=JSON.parse(fs.readFileSync(new URL('../src/data/frequency-listening/index.json',import.meta.url)));
  assert.ok(report.excludedTerms>500);assert.equal(c.summary.questions,bank.report.questions+90+transcripts.questionCount);assert.equal(c.terms.length,c.definitions.length);assert.equal(c.terms.length,c.referenceLevels.length);
  for(const label of ['!」「〇〇',')〇〇','々:','々(','ージー','ード','イペント','昭夫','遍い','しげい'])assert.equal(c.terms.some(row=>row[0]===label),false,label);
  assert.ok(c.terms.some(row=>row[0]==='Tシャツ'));assert.ok(c.terms.some(row=>row[0]==='雲'));
  for(const level of ['N1','N2','N3','N4','N5'])assert.ok(query(c,{kind:'grammar',grade:level}).total>0,level);
  assert.ok(query(c,{kind:'idiom',grade:'N3'}).total>0);assert.equal(query(c,{kind:'idiom',grade:'ungraded'}).total,0); assert.ok(query(c,{kind:'idiom'}).total>150);
  assert.match(c.referenceExpressionSource.name,/Kindrix/);
  for(const [, , counts]of c.units)for(let i=0;i<counts.length;i+=2)assert.ok(Number.isSafeInteger(counts[i])&&counts[i]>=0&&counts[i]<c.terms.length);
});


test('reviewed reading corrections require exact original errors and source evidence, and leave alternative readings intact', () => {
  const c={terms:[['授ける','さづける','动词','word'],['厳密','いむひそか','名词','word'],['灯','あかり','名词','word']]};
  const dictionary={'授ける':[{readings:['さずける']}],'厳密':[{readings:['げんみつ']}],'灯':[{readings:['とう']}]};
  const corrected=correctFrequencyReadings(c,dictionary);assert.equal(corrected.length,2);
  assert.deepEqual(c.terms.map(t=>t[1]),['さずける','げんみつ','あかり']);
  assert.throws(()=>correctFrequencyReadings({terms:[['授ける','さづける','动词','word']]},{}),/Unverified/);
});


test('reviewed supplements preserve sourced grades, require exact readings and label estimates independently of paper levels', () => {
  const c = {terms: [['母','はは','名词','word'], ['母','ぼ','名词','word'], ['未知','みち','名词','word'], ['ようになる','ようになる','语法表达','grammar']], referenceLevels: [['N5'],[],[],[]]};
  const report=annotateFrequencySupplements(c,[{kind:'word',label:'母',reading:'はは',levels:['N1'],method:'word-list'}], [{kind:'word',label:'未知',reading:'みち',levels:['N2'],method:'editorial'}, {kind:'grammar',label:'ようになる',levels:['N4'],method:'editorial'}],{name:'review'});
  assert.deepEqual(c.referenceLevels,[['N5'],[],['N2'],['N4']]);assert.deepEqual(c.referenceBasis,['reference','ungraded','editorial','editorial']);
  assert.equal(report.unresolved[0].reading,'ぼ');assert.equal(report.added.length,2);
});
test('compound filters preserve noun/verb POS and never classify a word by character count alone', () => {
  const labels=['申し込む','問い合わせ','環境問題','日本語','学生','無意識'];
  const trustedWords=new Set([...labels,'申す','込む','問う','合わせる','問い合わせる','環境','問題','日本','語','意識']);
  const builder=createFrequencyBuilder(text=>tokenizer.tokenize(text),{trustedWords});builder.addQuestion(question('compounds',{prompt:labels.join('。')+'。'}));const c=builder.finish('compounds');
  annotateFrequencyCompounds(c,{trustedWords,tokenize:text=>tokenizer.tokenize(text)});
  const rows=query(c,{pos:'复合词'}).rows;
  for(const label of ['申し込む','問い合わせ','環境問題','日本語'])assert.ok(rows.some(row=>row.label===label&&row.compound),label);
  assert.equal(rows.some(row=>row.label==='学生'),false);assert.equal(rows.some(row=>row.label==='無意識'),false);
  assert.equal(rows.find(row=>row.label==='申し込む').pos,'动词');assert.equal(rows.find(row=>row.label==='環境問題').pos,'名词');
  assert.equal(parseFrequencyFilters(new URLSearchParams('pos=复合词'),frequencyMetadata(c)).pos,'复合词');
});
test('expanded expressions resolve inflections, spelling variants and set phrases while retaining separate option boundaries', () => {
  const c=build([question('phrases',{prompt:'声をかけた。声を掛けます。経験を積んだ。計画を立てました。よろしくお願いします。',options:[{text:'経験を'},{text:'積んだ。'}]})]);
  assert.equal(find(c,'声をかける',{kind:'idiom'}).occurrences,2);
  assert.equal(find(c,'経験を積む',{kind:'idiom'}).occurrences,1);
  assert.equal(find(c,'計画を立てる',{kind:'idiom'}).occurrences,1);
  assert.equal(find(c,'よろしくお願いします',{kind:'idiom'}).occurrences,1);
});


test('a reviewed common spelling may override only a supplemental variant, never a primary reference grade', () => {
 const c={terms:[['すぐ','すぐ','副词','word'],['学生','がくせい','名词','word']],referenceLevels:[[],['N5']]};
 annotateFrequencySupplements(c,[{kind:'word',label:'すぐ',reading:'すぐ',levels:['N1'],method:'dictionary-variant'}],[{kind:'word',label:'すぐ',reading:'すぐ',levels:['N5'],method:'editorial',overridesVariant:true},{kind:'word',label:'学生',reading:'がくせい',levels:['N1'],method:'editorial',overridesVariant:true}],{});
 assert.deepEqual(c.referenceLevels,[['N5'],['N5']]);assert.deepEqual(c.referenceBasis,['editorial','reference']);
});

test('actual N2 choice artifacts do not invent archaic adjectives and correct listening nouns retain their sources', () => {
  const c=build([
    question('spelling',{category:'词汇',options:[{text:'短編'},{text:'短遍'},{text:'単遍'}]}),
    question('reading',{category:'词汇',prompt:'刺激を受けた。',options:[{text:'しげき'}]}),
    question('listening',{category:'听力',options:[{text:'かびんを運ぶ。しょっきを洗う。'}]}),
  ]);
  for(const label of ['遍い','しげい','かびる','しょう'])assert.equal(find(c,label),undefined,label);
  assert.equal(find(c,'刺激').pos,'名词');assert.equal(find(c,'刺激').reading,'しげき');assert.equal(find(c,'刺激').occurrences,2);
  assert.deepEqual(queryFrequency(c,{...defaultFrequencyFilters,q:'刺激'},find(c,'刺激').id).detail.examples.map(e=>e.id),['reading']);
  assert.equal(find(c,'花瓶').pos,'名词');assert.equal(find(c,'食器').reading,'しょっき');
  const wrongReading=build([question('wrong',{options:[{text:'しょくき'}]})]);
  assert.equal(find(wrongReading,'食器'),undefined); // Never repair an incorrect reading by inventing a small っ.
});
test('contextual stem review keeps legitimate derivations, modern potentials and real literary adjectives', () => {
  const c=build([question('valid',{prompt:'寒さ。短すぎる。妖しげ。摂れる。おぼしき人。遍い世界。読んでいる。読みます。'})]);
  for(const label of ['寒い','短い','妖しい','摂る','おぼしい','遍い','読む'])assert.ok(find(c,label),label);
  assert.equal(find(c,'読む').occurrences,2);
});
test('modern lexical repairs distinguish adjective, adverb and noun uses without swallowing adjacent text', () => {
  const c=build([question('modern',{prompt:'失くした。ばっちりです。すなおに謝る。ほけんしょうを出す。出ばなをくじく。哲学が愛し求める。かいしゅうする。れんしゅうする。きふする。'})]);
  assert.equal(find(c,'ばっちり').pos,'副词');assert.equal(find(c,'素直').pos,'形容词');
  for(const label of ['保険証','出ばな','回収','練習','寄付'])assert.equal(find(c,label).pos,'名词',label);
  assert.equal(find(c,'失くす').pos,'动词');assert.equal(find(c,'失くす').reading,'なくす');assert.equal(find(c,'くい'),undefined);
  assert.equal(find(c,'愛する').reading,'あいする');assert.equal(find(c,'愛しい'),undefined);
  for(const label of ['ばっちい','すい','ほける','出ばる','しゅうする','ふする'])assert.equal(find(c,label),undefined,label);
});
test('na-adjectives join the adjective filter and common adverbs never become common nouns', () => {
  const c=build([question('pos',{prompt:'綺麗な花。静かに読む。元気な人。なかなか難しい。ひとまず休む。学生が走る。'})]);
  for(const label of ['綺麗','静か','元気'])assert.equal(find(c,label).pos,'形容词',label);
  for(const label of ['学生','花'])assert.equal(find(c,label).pos,'名词',label);
  for(const label of ['なかなか','ひとまず'])assert.ok(query(c,{pos:'副词',q:label}).rows.length);
  assert.ok(query(c,{pos:'形容词'}).rows.some(row=>row.label==='綺麗'));
  assert.ok(!query(c,{pos:'名词'}).rows.some(row=>row.label==='綺麗'));
});
test('a homophone surname or noun cannot define a reviewed common verb, adjective or adverb', () => {
  const terms=[['かなり','かなり','副词','word'],['すすむ','すすむ','动词','word'],['わかい','わかい','形容词','word'],['からっと','からっと','副词','word']];
  const c={terms};annotateFrequencyCorpus(c,{'かなり':[{word:'金成',pos:'name',readings:['かなり'],glosses:['姓氏']}]});
  assert.match(c.definitions[0].meaning,/相当/);assert.match(c.definitions[1].meaning,/前进/);assert.match(c.definitions[2].meaning,/年轻/);assert.match(c.definitions[3].meaning,/清爽/);
});

test('dictionary-attested kana/kanji spellings merge counts, deduplicate shared coverage and preserve both source links', () => {
  const c=build([question('kanji',{level:'N1',passage:'華々しい。はなばなしい。'}),question('shared',{level:'N1',passage:'華々しい。はなばなしい。'}),question('kana',{level:'N2',prompt:'はなばなしい。'})]);
  const dictionary={'華々しい':[{word:'華々しい',pos:'adj',readings:['はなばなしい']}],'はなばなしい':[{word:'華々しい',pos:'adj',readings:['はなばなしい']}]};
  const questions=JSON.stringify(c.questions), references=JSON.stringify(c.units.map(u=>u.slice(0,2)));
  const total=find(c,'華々しい').occurrences+find(c,'はなばなしい').occurrences;
  const report=mergeFrequencyWordVariants(c,dictionary);
  assert.equal(report.mergedTerms,1);assert.equal(JSON.stringify(c.questions),questions);assert.equal(JSON.stringify(c.units.map(u=>u.slice(0,2))),references);
  const row=find(c,'華々しい');assert.equal(row.occurrences,total);assert.equal(row.occurrences,3);assert.equal(row.questions,3);assert.equal(row.papers,2);assert.deepEqual(row.aliases,['はなばなしい']);
  assert.deepEqual(query(c,{q:'はなばなしい'}).rows.map(r=>r.label),['華々しい']);
  assert.equal(queryFrequency(c,{...defaultFrequencyFilters,q:'華々しい'},row.id).detail.examples.length,3);
  for(const [, , counts]of c.units)assert.equal(new Set(counts.filter((_,i)=>i%2===0)).size,counts.length/2);
  annotateFrequencyLevels(c,[['はなばなしい','はなばなしい','N1']],{});assert.deepEqual(find(c,'華々しい').referenceLevels,['N1']);
  // All-corpus lower-level comparison uses the merged occurrence, not the
  // current spelling, source field or current N1-only filter.
  assert.equal(query(c,{q:'華々しい',level:'N1',exclusive:'N1'}).total,0);
});
test('homophones, mismatched readings and POS never merge merely because a dictionary contains a kanji spelling', () => {
  const c=build([question('ambiguous',{prompt:'会う。あう。橋。箸。はし。見る。診る。みる。'})]);
  const dictionary={'みる':[{word:'診る',pos:'verb',readings:['みる']}],'見る':[{word:'見る',pos:'unknown',readings:[]}],'あう':[{word:'会う',pos:'verb',readings:['あう']}],'会う':[{word:'会う',pos:'verb',readings:['あう']}],'合う':[{word:'合う',pos:'verb',readings:['あう']}],'はし':[{word:'橋',pos:'noun',readings:['はし']},{word:'箸',pos:'noun',readings:['はし']}]};
  assert.equal(mergeFrequencyWordVariants(c,dictionary).mergedTerms,0);
  const bad={terms:[['華々しい','はなばなしい','形容词','word'],['はなばなしい','はなばなしい','名词','word'],['はなばなしい','ちがう','形容词','word']],units:[],summary:{terms:3}};
  assert.equal(mergeFrequencyWordVariants(bad,{'はなばなしい':[{word:'華々しい',pos:'adj',readings:['はなばなしい']}]}).mergedTerms,0);
});
test('merged spellings preserve a published alias grade ahead of a canonical editorial estimate', () => {
  const c={terms:[['華々しい','はなばなしい','形容词','word']],aliases:[['はなばなしい']],referenceLevels:[[]]};
  annotateFrequencySupplements(c,[{kind:'word',label:'はなばなしい',reading:'はなばなしい',levels:['N1'],method:'word-list'}],[{kind:'word',label:'華々しい',reading:'はなばなしい',levels:['N2'],method:'editorial'}],{});
  assert.deepEqual(c.referenceLevels,[['N1']]);assert.deepEqual(c.referenceBasis,['supplemental']);
});
test('production retains merged spellings and grades only from word lists and reviewed estimates', () => {
  const c=JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz',import.meta.url))));
  assert.equal(c.aliases.length,c.terms.length);const row=find(c,'華々しい');assert.ok(row.aliases.includes('はなばなしい'));assert.equal(c.terms.some(t=>t[0]==='はなばなしい'),false);
  assert.deepEqual(query(c,{q:'はなばなしい'}).rows.map(r=>r.label),['華々しい']);
  const gradeReport=JSON.parse(fs.readFileSync(new URL('../src/data/bank-frequency/level-review-report.json',import.meta.url)));
  assert.equal(gradeReport.occurrence,undefined);
  assert.ok(c.referenceBasis.every(basis=>['reference','supplemental','editorial','ungraded'].includes(basis)));
  for(const label of ['解明','香道','羊'])assert.deepEqual(find(c,label).referenceLevels,[],label);
  const read=name=>JSON.parse(fs.readFileSync(new URL('../src/data/frequency-levels/'+name,import.meta.url)));
  const verified={...c};
  annotateFrequencyLevels(verified,read('entries.json'),read('source.json'),read('expression-entries.json'),read('expression-source.json'));
  annotateFrequencySupplements(verified,read('supplement-entries.json'),read('reviewed-entries.json'),read('supplement-source.json'));
  assert.deepEqual(c.referenceLevels,verified.referenceLevels);
  assert.deepEqual(c.referenceBasis,verified.referenceBasis);
});

test('maximum occurrences bounds whole filtered counts inclusively before paging and leaves unlimited queries unchanged', () => {
  const c=build([question('range-a',{period:'202412',prompt:'学生。学生。学校。学校。雲。'}),question('range-b',{period:'202407',prompt:'学生。'})]);
  const meta=frequencyMetadata(c),filters=parseFrequencyFilters(new URLSearchParams('min=2&max=2'),meta);
  assert.deepEqual(queryFrequency(c,filters).rows.map(r=>[r.label,r.occurrences]),[['学校',2]]);
  assert.deepEqual(query(c,{max:1}).rows.map(r=>r.label),['雲']);
  assert.equal(find(c,'学生',{period:'202412',max:2}).occurrences,2); // Bound the selected scope, not the corpus-global count.
  assert.equal(find(c,'学生',{max:2}),undefined);
  const paged=query(c,{max:2,size:1,page:2});assert.equal(paged.total,2);assert.equal(paged.rows.length,1);assert.equal(paged.totalOccurrences,3);
  assert.equal(queryFrequency(c,{...filters,max:0}).total,2);
  for(const raw of ['max=0','max=-1','max=2.5','max=1e2','max=100001','min=3&max=2'])assert.throws(()=>parseFrequencyFilters(new URLSearchParams(raw),meta),FrequencyInputError,raw);
  assert.equal(parseFrequencyFilters(new URLSearchParams(),meta).max,0);
  for(const kind of ['grammar','idiom']){
    const expressions=build([question('expressions',{prompt:kind==='grammar'?'学生にしては上手だ。学生にしては上手だ。':'気に入る。気に入る。'})]);
    assert.ok(query(expressions,{kind,max:2}).total>0);assert.equal(query(expressions,{kind,max:1}).total,0);
  }
});
