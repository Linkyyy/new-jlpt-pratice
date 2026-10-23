import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {convertExamBank, importExamBanks, examInstruction} from './import-exam-bank.mjs';
import {frequencySubtype} from '../src/lib/bank-frequency.mjs';

const sourceFile = 'N1_2025年7月_fixture.json';
const context = sectionId => ({examId: 'exam-one', examTag: 'N1', examTitle: '2025年7月', sectionId});
const leaf = (id, number, answer = '0', extra = {}) => ({objectId: id, title: `<u>言葉${number}</u>\r\n`, questionType: 11,
  identity: [`202507N1010101${String(number).padStart(3, '0')}*${number}`], options: ['一', '二', '三', '四'], rightAnswer: answer, analysis: `解析${number}`, ...extra});
function fixture() {
  return {exam: {id: 'exam-one', tag: 'N1', title: '2025年7月'}, status: 'partial',
    examMetadata: {tag: 'N1', title: '2025年7月', vocabularyNum: 4, grammarNum: 2, readingNum: 2, listeningNum: 1},
    sections: [
      {objectId: 'vocabulary', title: '問題1 読み方', questionType: 11, questionsNum: 4},
      {objectId: 'grammar', title: '問題7 次の文章を読んで', questionType: 23, questionsNum: 2},
      {objectId: 'reading', title: '問題9 次の文章を読んで', questionType: 32, questionsNum: 2},
      {objectId: 'listening', title: '問題1 聞いてください', questionType: 41, questionsNum: 1},
    ],
    items: [
      ...[0, 1, 2, 3].map(answer => leaf(`v${answer}`, answer + 1, String(answer), {_parent: context('vocabulary')})),
      {objectId: 'grammar-parent', questionType: 23, title: '<p>文章（5）（6）</p><MOJiTest_URL>', translation: '<p>文章译文</p>', _parent: context('grammar'),
        items: [leaf('g5', 5, '1', {title: '\n', questionType: 23}), leaf('g6', 6, '2', {title: '<p><br></p>', questionType: 23})]},
      {objectId: 'reading-parent', questionType: 32, title: '<p>同じ記事。</p>', _parent: context('reading'),
        items: [leaf('r7', 7, '0', {questionType: 32}), leaf('r8', 8, '3', {questionType: 32})]},
      {objectId: 'listening-parent', questionType: 41, title: '', subtitle: 'Do not use as a prompt', mediaId: 'remote/unknown.mp3', _parent: context('listening'),
        items: [leaf('l9', 9, '1', {questionType: 41})]},
    ]};
}
const convert = input => convertExamBank(input, {sourceFile});

test('official source reading types correct repeated problem numbers without altering the instruction body', () => {
  const body = ' 右のページは、お知らせである。';
  assert.equal(examInstruction({title:`問題12${body}`,questionType:36},'N1'),`問題13${body}`);
  assert.equal(examInstruction({title:`問題１３${body}`,questionType:36},'N2'),`問題14${body}`);
  assert.equal(examInstruction({title:`問題7${body}`,questionType:36},'N3'),`問題7${body}`);
  assert.equal(examInstruction({title:`問題12${body}`,questionType:35},'N1'),`問題12${body}`);
  assert.equal(examInstruction({title:`問題3${body}`,questionType:23},'N1'),`問題3${body}`);
});

test('all newly opened image questions have the correct official subtype and keep information retrieval apart from thematic reading', async () => {
  const report = JSON.parse(await fs.readFile(new URL('../docs/exam-bank-import-2026-10-22.json',import.meta.url),'utf8'));
  let corrected = 0;
  for(const paper of report.papers){
    const bank = JSON.parse(await fs.readFile(new URL(`../src/data/imported-bank/questions/${paper.period}-${paper.level}-3.json`,import.meta.url),'utf8'));
    for(const question of bank.questions.filter(q=>q.media?.images.length)){
      const expected = paper.level==='N3' && question.sourceQuestionNumber===24 ? 'reading-short' : 'reading-information';
      assert.equal(frequencySubtype({...question,source:'imported'}).id,expected,question.id);
    }
    const info = bank.questions.at(-1), previous = bank.questions.at(-3);
    assert.notEqual(info.instruction.match(/問題\s*\d+/)?.[0],previous.instruction.match(/問題\s*\d+/)?.[0]);
    corrected += bank.sourceMetadata.questions.filter(q=>q.originalInstruction).length;
  }
  assert.equal(corrected,6);
});

test('zero-based answers retain the four original positions and numeric labels', () => {
  const {groups, report} = convert(fixture());
  const vocabulary = groups.find(group => group.payload.type === 'vocabulary').payload;
  assert.deepEqual(vocabulary.questions.map(question => question.correctOptionId), ['A', 'B', 'C', 'D']);
  assert.deepEqual(vocabulary.questions[0].options.map(option => option.label), ['1', '2', '3', '4']);
  assert.equal(vocabulary.questions[0].prompt, '<u>言葉1</u>');
  assert.equal(report.written, 8); assert.equal(report.available, 8);
  for (const question of vocabulary.questions) {
    assert.match(question.id, /^imported:202507:N1:1:\d+:\d+$/);
    assert.ok(Number.isSafeInteger(question.sourceId));
  }
});

test('passage children share complete articles, keep their own answers and explanations, and recover false partial counts', () => {
  const {groups, report} = convert(fixture());
  const grammar = groups[1].payload.questions, reading = groups[2].payload.questions;
  assert.equal(report.expandedSectionsComplete, true); assert.equal(report.sourceStatus, 'partial');
  assert.equal(grammar.length, 2); assert.equal(grammar[0].passage, '<p>文章（5）（6）</p>');
  assert.equal(grammar[0].passage, grammar[1].passage);
  assert.match(grammar[0].prompt, /第 5 题/); assert.match(grammar[1].prompt, /第 6 题/);
  assert.equal(grammar[0].explanation[0], '解析5'); assert.equal(grammar[1].explanation[0], '解析6');
  assert.match(grammar[0].explanation[1], /文章译文/);
  assert.equal(reading[0].passage, reading[1].passage);
  assert.equal(reading[0].instruction, '問題9 次の文章を読んで');
});

test('listening is counted as skipped without importing transcripts, audio paths or listening groups', () => {
  const {groups, report} = convert(fixture());
  assert.equal(report.listeningSkipped, 1);
  assert.deepEqual(groups.map(group => group.payload.type), ['vocabulary', 'grammar', 'reading']);
  assert.doesNotMatch(JSON.stringify(groups), /remote\/unknown|Do not use as a prompt|听力/);
});

test('missing passage and question images quarantine all affected children and preserve exact source references', () => {
  const input = fixture();
  input.items[5].imageId = 'mojitest/exams/picture/article.png';
  input.items[5].items[0].imageId = 'mojitest/exams/picture/question.png';
  const {groups, report} = convert(input);
  const reading = groups[2].payload;
  assert.equal(reading.questions.length, 0); assert.equal(report.unavailable, 2);
  assert.deepEqual(reading.unavailable[0].reasons, ['缺少配套图片']);
  assert.deepEqual(reading.sourceMetadata.questions[0].images, {passage: 'mojitest/exams/picture/article.png', question: 'mojitest/exams/picture/question.png'});
  assert.deepEqual(reading.sourceMetadata.questions[0].uploadImages, {passage: 'pic/12025077.jpg', question: 'pic/12025077-1.jpg'});
  assert.equal(reading.unavailable[0].raw.picture, 'pic/12025077.jpg');
  assert.equal(reading.unavailable[0].raw.questionPicture, 'pic/12025077-1.jpg');
  assert.equal(reading.unavailable[1].raw.picture, reading.unavailable[0].raw.picture);
  assert.equal(reading.unavailable[0].raw.article, '<p>同じ記事。</p>');
  assert.equal(reading.unavailable[0].raw.option1, '一');
});

test('image filenames use printed question numbers, keep the first shared article number, and remain stable after reordering', () => {
  const input = fixture();
  input.items[5].imageId = 'mojitest/exams/picture/article.png';
  input.items[5].items[0].identity = ['202507N1010310059*24'];
  input.items[5].items[1].identity = ['202507N1010310060*25'];
  const first = convert(input).groups[2].payload;
  assert.equal(first.unavailable[0].questionNumber, 24);
  assert.equal(first.unavailable[0].media.picture, 'pic/120250724.jpg');
  assert.equal(first.unavailable[1].media.picture, 'pic/120250724.jpg');
  input.items[5].items.reverse();
  const reversed = convert(input).groups[2].payload;
  assert.equal(reversed.unavailable[0].media.picture, first.unavailable[0].media.picture);
});

test('verified articles and child pictures open only complete questions with stable answers and source order', () => {
  const input = fixture();
  input.items[5].imageId = 'mojitest/exams/picture/article.png';
  input.items[5].items[0].imageId = 'mojitest/exams/picture/question.png';
  const excluded = convert(input).groups[2].payload;
  const partial = convertExamBank(input, {sourceFile, availableImages: new Set(['pic/12025077.jpg'])}).groups[2].payload;
  assert.deepEqual(partial.questions.map(q => q.sourceQuestionNumber), [8]);
  assert.deepEqual(partial.unavailable.map(q => q.questionNumber), [7]);
  const enabled = convertExamBank(input, {sourceFile, availableImages: new Set(['pic/12025077.jpg', 'pic/12025077-1.jpg'])}).groups[2].payload;
  assert.equal(enabled.unavailable.length, 0);
  assert.deepEqual(enabled.questions.map(q => q.id), excluded.unavailable.map(q => q.id));
  assert.deepEqual(enabled.questions.map(q => q.correctOptionId), ['A', 'D']);
  assert.deepEqual(enabled.questions.map(q => q.media.images), [['pic/12025077.jpg'], ['pic/12025077.jpg']]);
  assert.deepEqual(enabled.questions[0].media.questionImages, ['pic/12025077-1.jpg']);
  assert.equal(enabled.questions[1].media.questionImages, undefined);
});

test('verified image activation survives reimports and a failed verification report cannot change the bank', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'jlpt-image-activation-test-'));
  try {
    const sourceDirectory = path.join(temp, 'source'), outputDirectory = path.join(temp, 'bank');
    await fs.mkdir(sourceDirectory); await fs.mkdir(outputDirectory);
    const input = fixture(); input.items[5].imageId = 'mojitest/exams/picture/article.png';
    await fs.writeFile(path.join(sourceDirectory, sourceFile), JSON.stringify(input));
    const first = await importExamBanks({sourceDirectory, outputDirectory});
    assert.equal(first.unavailable, 2);
    // Local unit fixture only; never used to activate the production data.
    const verifiedImagesFile = path.join(temp, 'unit-fixture-verification.json');
    const image = {key: 'pic/12025077.jpg', url: 'https://example.com/pic/12025077.jpg', status: 'available', httpStatus: 200,
      bytes: 100, width: 80, height: 100, sha256: 'a'.repeat(64)};
    const report = {version: 1, status: 'passed', checkedAt: new Date().toISOString(), baseUrl: 'https://example.com', images: [image]};
    await fs.writeFile(verifiedImagesFile, JSON.stringify(report));
    const enabled = await importExamBanks({sourceDirectory, outputDirectory, verifiedImagesFile});
    assert.equal(enabled.available, 8); assert.equal(enabled.unavailable, 0);
    const before = await fs.readFile(path.join(outputDirectory, 'questions/202507-N1-3.json'), 'utf8');
    const reimported = await importExamBanks({sourceDirectory, outputDirectory});
    assert.equal(reimported.available, 8);
    assert.equal(await fs.readFile(path.join(outputDirectory, 'questions/202507-N1-3.json'), 'utf8'), before);
    await fs.writeFile(verifiedImagesFile, JSON.stringify({...report, status: 'failed'}));
    await assert.rejects(importExamBanks({sourceDirectory, outputDirectory, verifiedImagesFile}), /must pass verification/);
    assert.equal(await fs.readFile(path.join(outputDirectory, 'questions/202507-N1-3.json'), 'utf8'), before);
  } finally { await fs.rm(temp, {recursive: true, force: true}); }
});

test('the upload checklist maps all 17 opened subquestions to 11 unique numbered JPG paths and retains the original filenames', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../docs/exam-bank-missing-images-2026-10-22.json', import.meta.url), 'utf8'));
  assert.equal(manifest.images.length, 11);
  assert.equal(new Set(manifest.images.map(image => image.uploadPath)).size, 11);
  const affected = new Set();
  for (const image of manifest.images) {
    assert.match(image.uploadPath, /^pic\/[1-3]\d{6}\d+(?:-\d+)?\.jpg$/);
    assert.match(image.reference, /^mojitest\/exams\/picture\//);
    for (const question of image.questions) {
      const bank = JSON.parse(await fs.readFile(new URL(`../src/data/imported-bank/questions/${question.period}-${question.level}-3.json`, import.meta.url), 'utf8'));
      const provenance = bank.sourceMetadata.questions.find(item => item.id === question.id);
      const enabled = bank.questions.find(item => item.id === question.id);
      assert.ok(enabled);
      assert.equal(bank.unavailable.length, 0);
      assert.equal(provenance.images[question.kind], image.reference);
      assert.equal(provenance.uploadImages[question.kind], image.uploadPath);
      assert.ok((question.kind === 'question' ? enabled.media.questionImages : enabled.media.images).includes(image.uploadPath));
      affected.add(question.id);
    }
  }
  assert.equal(affected.size, 17);
  const n3 = manifest.images.find(image => image.questions.some(q => q.level === 'N3' && q.period === '202512' && q.id.endsWith(':24')));
  assert.equal(n3.uploadPath, 'pic/320251224.jpg');
  const sharedN3 = manifest.images.filter(image => image.questions.some(q => q.level === 'N3' && q.id.endsWith(':37')));
  assert.deepEqual(sharedN3.map(image => image.uploadPath).sort(), ['pic/320241237.jpg', 'pic/320251237.jpg']);
});

test('owner-confirmed uploaded images enable only listed resources and persist without a fabricated verification report', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'jlpt-confirmed-uploads-'));
  try {
    const sourceDirectory = path.join(temp, 'source'), outputDirectory = path.join(temp, 'bank');
    await fs.mkdir(sourceDirectory); await fs.mkdir(outputDirectory);
    const input = fixture(); input.items[5].imageId = 'mojitest/exams/picture/article.png';
    input.items[5].items[0].imageId = 'mojitest/exams/picture/question.png';
    await fs.writeFile(path.join(sourceDirectory, sourceFile), JSON.stringify(input));
    const uploadedImagesFile = path.join(temp, 'uploads.json');
    await fs.writeFile(uploadedImagesFile, JSON.stringify({images: [{uploadPath: 'pic/12025077.jpg'}]}));
    const result = await importExamBanks({sourceDirectory, outputDirectory, uploadedImagesFile});
    assert.equal(result.available, 7); assert.equal(result.unavailable, 1);
    const confirm = JSON.parse(await fs.readFile(path.join(outputDirectory, 'uploaded-reading-images.json'), 'utf8'));
    assert.equal(confirm.source, 'owner-confirmed'); assert.equal(confirm.status, undefined);
    await assert.rejects(fs.access(path.join(outputDirectory, 'verified-reading-images.json')));
    const reimported = await importExamBanks({sourceDirectory, outputDirectory});
    assert.equal(reimported.available, result.available); assert.equal(reimported.unavailable, result.unavailable);
    await fs.writeFile(uploadedImagesFile, JSON.stringify({images: [{uploadPath: 'pic/../invalid.jpg'}]}));
    await assert.rejects(importExamBanks({sourceDirectory, outputDirectory, uploadedImagesFile}), /Invalid uploaded/);
  } finally { await fs.rm(temp, {recursive: true, force: true}); }
});

test('invalid answer positions or empty options are excluded instead of shifting choices or guessing answers', () => {
  const input = fixture(); input.items[0].rightAnswer = '4'; input.items[1].options[0] = '';
  const payload = convert(input).groups[0].payload;
  assert.equal(payload.questions.length, 2); assert.equal(payload.unavailable.length, 2);
  assert.equal(payload.unavailable[1].raw.option1, ''); assert.equal(payload.unavailable[1].raw.option2, '二');
});

test('the containing section corrects an inconsistent item subtype and printed numbering wins over global identity numbering', () => {
  const input = fixture(); input.items[5].items[0].questionType = 33;
  input.items[5].items[0].identity = ['202507N1010310059*23'];
  const {groups, report} = convert(input);
  assert.equal(groups[2].payload.questions[0].sourceQuestionNumber, 23);
  assert.equal(groups[2].payload.sourceMetadata.questions[0].globalQuestionNumber, 59);
  assert.equal(groups[2].payload.sourceMetadata.questions[0].questionType, 32);
  assert.equal(report.warnings[0].issue, 'question-type-mismatch');
});

test('incomplete sections, duplicate source IDs and foreign exam metadata fail validation', () => {
  const incomplete = fixture(); incomplete.items.pop(); assert.throws(() => convert(incomplete), /section count mismatch/);
  const duplicate = fixture(); duplicate.items[1].objectId = duplicate.items[0].objectId; assert.throws(() => convert(duplicate), /Duplicate source object/);
  const foreign = fixture(); foreign.items[0]._parent.examId = 'another-exam'; assert.throws(() => convert(foreign), /different exam/);
  const wrongIdentity = fixture(); wrongIdentity.items[0].identity = ['202412N1010101001*1']; assert.throws(() => convert(wrongIdentity), /identity/);
});

test('incremental imports preserve unrelated questions, merge idempotently and refuse to replace populated legacy groups', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'jlpt-exam-import-'));
  try {
    const sourceDirectory = path.join(temp, 'source'), outputDirectory = path.join(temp, 'bank'), questions = path.join(outputDirectory, 'questions');
    await fs.mkdir(sourceDirectory); await fs.mkdir(questions, {recursive: true});
    await fs.writeFile(path.join(sourceDirectory, sourceFile), JSON.stringify(fixture()));
    const original = {version: 1, sourceFile: 'legacy.json', period: '202412', level: 'N2', type: 'listening',
      questions: [{id: 'imported:202412:N2:4:123:1'}], unavailable: []};
    const oldFile = path.join(questions, '202412-N2-4.json'), oldText = JSON.stringify(original);
    await fs.writeFile(oldFile, oldText);
    await fs.writeFile(path.join(outputDirectory, 'index.json'), JSON.stringify({version: 1, generatedBy: 'jlpt-practice/import-question-bank/v1', sourceLabel: '用户提供题库',
      groups: [{level: 'N2', period: '202412', type: 'listening', file: '202412-N2-4.json', availableCount: 1, unavailableCount: 0, totalCount: 1}],
      report: {files: 1, sourceRecords: 1, containers: 0, questions: 1, available: 1, unavailable: 0, inheritedMetadata: 0, reasons: {}, errors: []}}));
    const first = await importExamBanks({sourceDirectory, outputDirectory});
    assert.equal(first.available, 8); assert.equal(first.listeningSkipped, 1);
    const firstIndex = await fs.readFile(path.join(outputDirectory, 'index.json'), 'utf8');
    assert.equal(await fs.readFile(oldFile, 'utf8'), oldText);
    const manifest = JSON.parse(firstIndex); assert.equal(manifest.report.available, 9); assert.equal(manifest.groups.length, 4);
    await importExamBanks({sourceDirectory, outputDirectory});
    assert.equal(await fs.readFile(path.join(outputDirectory, 'index.json'), 'utf8'), firstIndex);
    const newFile = path.join(questions, '202507-N1-1.json'), populated = JSON.parse(await fs.readFile(newFile, 'utf8'));
    delete populated.sourceMetadata;
    const legacyText = JSON.stringify(populated); await fs.writeFile(newFile, legacyText);
    await assert.rejects(importExamBanks({sourceDirectory, outputDirectory}), /populated legacy group/);
    assert.equal(await fs.readFile(newFile, 'utf8'), legacyText);
    assert.equal(await fs.readFile(path.join(outputDirectory, 'index.json'), 'utf8'), firstIndex);
  } finally { await fs.rm(temp, {recursive: true, force: true}); }
});
