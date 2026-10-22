import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {extractListeningTranscripts, importListeningTranscripts} from './import-listening-transcripts.mjs';
import {defaultFrequencyFilters, listeningTranscript, queryFrequency} from '../src/lib/bank-frequency.mjs';

const sourceFile = 'N1_2025年7月_fixture.json';
function fixture() {
  const child = number => ({objectId: `child-${number}`, title: '【本试卷音频为AI生成，发音仅供参考】', questionType: 46,
    identity: [`202507N1020421${String(number).padStart(3, '0')}*01*質問1`], options: ['図書館', '教室', '映画館', '会社'], rightAnswer: '0'});
  const parent = (id, items, subtitle) => ({objectId: id, questionType: 46, title: '', subtitle, items,
    mediaId: 'private/original.mp3', translation: 'TRANSLATION_SENTINEL 中文译文',
    _parent: {examId: 'fixture', examTag: 'N1', examTitle: '2025年7月', sectionId: 'section'}});
  return {exam: {id: 'fixture', tag: 'N1', title: '2025年7月'}, status: 'partial',
    examMetadata: {tag: 'N1', title: '2025年7月', vocabularyNum: 0, grammarNum: 0, readingNum: 0, listeningNum: 3},
    sections: [{objectId: 'section', title: '問題5 長めの話を聞きます', questionType: 46, questionsNum: 3}],
    items: [parent('shared', [child(94), child(95)], '<p>学生は図書館で勉強しています。</p><MOJiTest_URL>'),
      parent('separate', [child(96)], '<p>先生は教室で話しています。</p>')]};
}
const extract = input => extractListeningTranscripts(input, {sourceFile});

test('extracts Japanese originals with stable global question numbers without audio, translations or playable questions', () => {
  const source = extract(fixture());
  assert.equal(source.questionCount, 3); assert.equal(source.passageCount, 2); assert.equal(source.missingTranscripts, 0);
  assert.deepEqual(source.questions.map(q => q.sourceQuestionNumber), [94, 95, 96]);
  for (const question of source.questions) {
    assert.equal(question.available, false); assert.equal(question.category, '听力'); assert.equal(question.prompt, '');
    assert.match(question.id, /^imported:202507:N1:4:\d+:\d+$/);
    assert.match(listeningTranscript(question.explanation), /学生|先生/);
  }
  assert.doesNotMatch(JSON.stringify(source), /TRANSLATION_SENTINEL|original\.mp3|AI生成|MOJiTest_URL/);
  assert.equal(source.questions[0].explanation[0], source.questions[1].explanation[0]);
  assert.equal(source.questions[0].sourceParentId, source.questions[1].sourceParentId);
});

test('prefers an explicit child original, inherits over empty HTML, and records absent originals without inventing text', () => {
  const input = fixture(); input.items[0].items[0].subtitle = '<p>子供が公園で遊んでいます。</p>';
  input.items[0].items[1].subtitle = '<p><br></p>';
  const source = extract(input);
  assert.match(listeningTranscript(source.questions[0].explanation), /子供/);
  assert.match(listeningTranscript(source.questions[1].explanation), /学生/);
  input.items[1].subtitle = '<br>';
  const partial = extract(input); assert.equal(partial.questionCount, 2); assert.equal(partial.missingTranscripts, 1);
  assert.equal(partial.warnings[0].objectId, 'child-96');
});

test('rejects duplicate global numbers instead of overwriting a source', () => {
  const input = fixture(); input.items[0].items[1].identity = input.items[0].items[0].identity;
  assert.throws(() => extract(input), /Duplicate listening question number/);
});

test('imports are idempotent and keep the practice bank untouched', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'jlpt-transcript-'));
  try {
    const sourceDirectory = path.join(temporary, 'input'), outputDirectory = path.join(temporary, 'statistics');
    await fs.mkdir(sourceDirectory); await fs.writeFile(path.join(sourceDirectory, sourceFile), JSON.stringify(fixture()));
    const practice = path.join(temporary, 'practice-bank.json'), sentinel = '{"available":540}'; await fs.writeFile(practice, sentinel);
    const first = await importListeningTranscripts({sourceDirectory, outputDirectory}); assert.equal(first.questionCount, 3);
    const before = await fs.readFile(path.join(outputDirectory, 'exams/202507-N1.json'), 'utf8');
    const index = await fs.readFile(path.join(outputDirectory, 'index.json'), 'utf8');
    await importListeningTranscripts({sourceDirectory, outputDirectory});
    assert.equal(await fs.readFile(path.join(outputDirectory, 'exams/202507-N1.json'), 'utf8'), before);
    assert.equal(await fs.readFile(path.join(outputDirectory, 'index.json'), 'utf8'), index);
    assert.equal(await fs.readFile(practice, 'utf8'), sentinel);
    await assert.rejects(fs.access(path.join(outputDirectory, 'questions')));
  } finally { await fs.rm(temporary, {recursive: true, force: true}); }
});

test('all 236 real listening subquestions are searchable through 230 shared originals with practice links disabled', async () => {
  const directory = new URL('../src/data/frequency-listening/', import.meta.url);
  const manifest = JSON.parse(await fs.readFile(new URL('index.json', directory), 'utf8'));
  const corpus = JSON.parse(gunzipSync(await fs.readFile(new URL('../src/data/bank-frequency/corpus.json.gz', import.meta.url))));
  assert.equal(manifest.questionCount, 236); assert.equal(manifest.passageCount, 230);
  const ids = new Set(), indexes = new Set();
  const positions = new Map(corpus.questions.map((q, index) => [q[0], index]));
  for (const group of manifest.groups) {
    const source = JSON.parse(await fs.readFile(new URL(`exams/${group.file}`, directory), 'utf8'));
    for (const question of source.questions) {
      assert(!ids.has(question.id)); ids.add(question.id);
      const position = positions.get(question.id); assert.notEqual(position, undefined);
      const metadata = corpus.questions[position]; assert.equal(metadata[7], false); assert.equal(metadata[4], 'listening');
      indexes.add(position);
    }
  }
  const transcriptUnits = corpus.units.filter(([field, linked]) => field === 'transcript' && linked.some(index => indexes.has(index)));
  assert.equal(transcriptUnits.length, 230);
  assert.deepEqual(new Set(transcriptUnits.flatMap(([, linked]) => linked)), indexes);
  assert.equal(transcriptUnits.filter(([, linked]) => linked.length === 2).length, 6);
  const filters = {...defaultFrequencyFilters, source: 'imported', level: 'N1', period: '202507', category: 'listening', field: 'transcript'};
  const result = queryFrequency(corpus, filters); assert.ok(result.total > 0);
  const detail = queryFrequency(corpus, filters, result.rows[0].id).detail;
  assert.ok(detail.examples.length > 0); assert.ok(detail.examples.every(example => example.available === false && ids.has(example.id)));
});
