import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const generator = 'jlpt-practice/import-question-bank/v1';
const converter = 'jlpt-practice/import-exam-bank/v1';
const types = {1: 'vocabulary', 2: 'grammar', 3: 'reading'};
const categories = {1: '词汇', 2: '语法', 3: '阅读'};
const letters = ['A', 'B', 'C', 'D'];
const text = value => typeof value === 'string' ? value.replace(/<\/?MOJiTest_URL\s*>/gi, '').replace(/\r\n?/g, '\n').trim() : '';
const visible = value => text(value).replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim();
const digest = value => createHash('sha256').update(value).digest('hex');

function sourceIdentity(row, period, level) {
  const identity = row.identity?.find(value => typeof value === 'string' && value.startsWith(`${period}${level}`));
  assert(identity, `Missing or mismatched identity: ${row.objectId}`);
  const [prefix, printed] = identity.split('*');
  const number = prefix.match(/(\d{3})(?:-\d{3})?$/);
  assert(number && /^\d+$/.test(printed), `Invalid written question number: ${identity}`);
  // N3 vocabulary and grammar/reading have separate printed numbering.
  return {identity, number: Number(printed), globalNumber: Number(number[1])};
}

/** Convert the nested exam export without changing the application's question schema. */
export function convertExamBank(input, {sourceFile, checksum = digest(JSON.stringify(input))} = {}) {
  assert(input && typeof input === 'object' && input.exam && Array.isArray(input.sections) && Array.isArray(input.items), 'Expected an exam export with exam, sections and items');
  assert(typeof sourceFile === 'string' && path.basename(sourceFile) === sourceFile, 'Expected a source filename');
  const {exam} = input;
  assert(/^N[1-5]$/.test(exam.tag) && typeof exam.id === 'string' && exam.id, 'Invalid exam level or ID');
  const date = exam.title?.match(/^(\d{4})年(\d{1,2})月$/);
  assert(date && Number(date[2]) >= 1 && Number(date[2]) <= 12, 'Invalid exam period');
  const period = `${date[1]}${date[2].padStart(2, '0')}`, level = exam.tag;
  const metadata = input.examMetadata ?? {};
  assert(!metadata.tag || metadata.tag === level, 'Exam metadata level mismatch');
  assert(!metadata.title || metadata.title === exam.title, 'Exam metadata period mismatch');
  const sections = new Map(input.sections.map(section => [section.objectId, section]));
  assert.equal(sections.size, input.sections.length, 'Duplicate section IDs');
  const groups = new Map([1, 2, 3].map(type => [type, {
    version: 1, sourceFile, period, level, type: types[type], questions: [], unavailable: [],
    sourceMetadata: {format: converter, checksum, examId: exam.id, sourceStatus: input.status ?? null, questions: []},
    importStats: {sourceRecords: 0, containers: 0},
  }]));
  const seen = new Set(), numbers = new Set(), sectionCounts = new Map(), warnings = [];
  let listeningSkipped = 0;

  function visit(row, section, parent = null) {
    assert(row && typeof row === 'object' && typeof row.objectId === 'string' && row.objectId, 'Invalid question object');
    assert(!seen.has(row.objectId), `Duplicate source object ID: ${row.objectId}`);
    seen.add(row.objectId);
    const type = Math.floor(section.questionType / 10);
    assert(type >= 1 && type <= 4, `Unknown section type: ${section.questionType}`);
    if (Array.isArray(row.items) && row.items.length) {
      assert(!parent, 'Unexpected nested passage containers');
      if (type !== 4) { groups.get(type).importStats.containers++; groups.get(type).importStats.sourceRecords++; }
      for (const child of row.items) visit(child, section, row);
      return;
    }
    sectionCounts.set(section.objectId, (sectionCounts.get(section.objectId) ?? 0) + 1);
    // No listening questions, guessed audio paths or placeholder recordings are imported.
    if (type === 4) { listeningSkipped++; return; }
    const group = groups.get(type);
    group.importStats.sourceRecords++;
    const source = sourceIdentity(row, period, level);
    const key = `${type}:${source.number}`;
    assert(!numbers.has(key), `Duplicate printed question number: ${key}`);
    numbers.add(key);
    // Existing favorites, backups and feedback require numeric imported source IDs.
    // A 48-bit digest is safely representable as a JS integer and stable across reimports.
    const sourceId = Number.parseInt(digest(`${exam.id}:${row.objectId}`).slice(0, 12), 16);
    const id = `imported:${period}:${level}:${type}:${sourceId}:${source.number}`;
    assert(!group.sourceMetadata.questions.some(item => item.id === id), `Source ID collision: ${id}`);
    const instruction = text(section.title);
    const passage = parent ? text(parent.title) : '';
    const title = text(row.title);
    const prompt = visible(title) ? title : parent ? `请选择第 ${source.number} 题的答案（对应文章中的题号）。` : '';
    const options = Array.isArray(row.options) ? row.options.map((value, index) => ({id: letters[index], label: String(index + 1), text: text(value)})) : [];
    const answer = /^(?:0|1|2|3)$/.test(String(row.rightAnswer)) ? Number(row.rightAnswer) : -1;
    const explanation = [text(row.analysis) || '该题库未提供解析。'];
    if (text(parent?.translation)) explanation.push(`<p><strong>文章译文</strong></p>${text(parent.translation)}`);
    const parentImage = text(parent?.imageId), questionImage = text(row.imageId);
    const reasons = [];
    if (!visible(prompt)) reasons.push('题干缺失');
    if (options.length !== 4 || options.some(option => !visible(option.text)) || answer < 0 || answer >= options.length) reasons.push('选项或答案不完整');
    if (parentImage || questionImage) reasons.push('缺少配套图片');
    if (parent && !visible(passage) && !parentImage) reasons.push('文章缺失');
    const question = {id, level, category: categories[type], prompt, ...(passage ? {passage} : {}), ...(instruction ? {instruction} : {}), richText: true,
      options, correctOptionId: letters[answer] ?? null, explanation, sourceQuestionNumber: source.number, sourceId};
    group.sourceMetadata.questions.push({id, objectId: row.objectId, identity: source.identity, globalQuestionNumber: source.globalNumber,
      sectionId: section.objectId, questionType: section.questionType, ...(parent ? {parentObjectId: parent.objectId} : {}),
      ...(parentImage || questionImage ? {images: {passage: parentImage, question: questionImage}} : {})});
    if (reasons.length) {
      // Keep the established unavailable-record shape so resource checks and text statistics still work.
      const raw = {id: sourceId, time: period, level, type, questionId: source.number, bigTitle: instruction,
        question: prompt, littleQuestion: prompt, article: passage, answer: answer + 1, assistantNew: explanation.join('\n\n'),
        picture: parentImage || questionImage, ...(questionImage ? {questionPicture: questionImage} : {}),
        ...Object.fromEntries(options.map((option, index) => [`option${index + 1}`, option.text]))};
      group.unavailable.push({id, sourceId, questionNumber: source.number, reasons, media: {picture: parentImage || questionImage, audio: ''}, raw});
    } else group.questions.push(question);
    if (row.questionType !== section.questionType) warnings.push({id, issue: 'question-type-mismatch', sourceType: row.questionType, sectionType: section.questionType, resolution: 'Use the enclosing section type'});
  }

  for (const row of input.items) {
    const context = row?._parent;
    assert(context?.examId === exam.id && context.examTag === level && context.examTitle === exam.title, 'Question belongs to a different exam');
    const section = sections.get(context.sectionId);
    assert(section, `Unknown question section: ${context.sectionId}`);
    visit(row, section);
  }
  const sectionResults = input.sections.map(section => ({id: section.objectId, expected: section.questionsNum, actual: sectionCounts.get(section.objectId) ?? 0}));
  for (const section of sectionResults) assert.equal(section.actual, section.expected, `Expanded section count mismatch: ${section.id}`);
  const expected = [metadata.vocabularyNum, metadata.grammarNum, metadata.readingNum];
  const results = [...groups].map(([type, payload]) => {
    const count = payload.questions.length + payload.unavailable.length;
    if (expected[type - 1] != null) assert.equal(count, expected[type - 1], `Written question count mismatch: ${period}/${level}/${types[type]}`);
    return {file: `${period}-${level}-${type}.json`, payload};
  });
  if (metadata.listeningNum != null) assert.equal(listeningSkipped, metadata.listeningNum, 'Listening count mismatch');
  const report = {sourceFile, checksum, level, period, sourceStatus: input.status ?? null,
    written: results.reduce((sum, {payload}) => sum + payload.questions.length + payload.unavailable.length, 0),
    available: results.reduce((sum, {payload}) => sum + payload.questions.length, 0),
    unavailable: results.reduce((sum, {payload}) => sum + payload.unavailable.length, 0), listeningSkipped,
    expandedSectionsComplete: true, sectionCounts: sectionResults, warnings};
  return {groups: results, report};
}

/** Merge only the selected exam groups, retaining every other bank and stable ID. */
export async function importExamBanks({sourceDirectory, outputDirectory, reportFile}) {
  const files = (await fs.readdir(sourceDirectory)).filter(file => file.endsWith('.json')).sort();
  assert(files.length, 'No JSON exam exports found');
  const exams = [], selected = new Set();
  for (const sourceFile of files) {
    const bytes = await fs.readFile(path.join(sourceDirectory, sourceFile));
    const result = convertExamBank(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')), {sourceFile, checksum: digest(bytes)});
    const key = `${result.report.level}:${result.report.period}`;
    assert(!selected.has(key), `Multiple input files for the same exam: ${key}`);
    selected.add(key); exams.push(result);
  }
  const manifestPath = path.join(outputDirectory, 'index.json');
  let previous;
  try { previous = JSON.parse(await fs.readFile(manifestPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    previous = {version: 1, generatedBy: generator, sourceLabel: '用户提供题库', groups: [], report: {sourceRecords: 0, containers: 0, inheritedMetadata: 0, errors: []}};
  }
  assert.equal(previous.generatedBy, generator, 'Refusing to overwrite an unmanaged imported bank');
  const questionDirectory = path.join(outputDirectory, 'questions');
  const replacements = new Map(exams.flatMap(exam => exam.groups.map(group => [group.file, group.payload])));
  const groups = previous.groups.map(group => {
    const payload = replacements.get(group.file);
    return payload ? indexGroup(group.file, payload) : group;
  });
  for (const [file, payload] of replacements) if (!groups.some(group => group.file === file)) groups.push(indexGroup(file, payload));
  const report = {...previous.report, files: groups.length, questions: 0, available: 0, unavailable: 0, reasons: {}};
  const ids = new Set();
  // Validate the complete merge before writing any files. Never replace populated legacy groups.
  for (const group of groups) {
    let payload;
    if (replacements.has(group.file)) {
      let old;
      try { old = JSON.parse(await fs.readFile(path.join(questionDirectory, group.file), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      assert(!old || !(old.questions.length + old.unavailable.length) || old.sourceMetadata?.format === converter,
        `Refusing to replace a populated legacy group and invalidate its IDs: ${group.file}`);
      payload = replacements.get(group.file);
      report.sourceRecords += payload.importStats.sourceRecords - (old?.importStats?.sourceRecords ?? 0);
      report.containers += payload.importStats.containers - (old?.importStats?.containers ?? 0);
    } else payload = JSON.parse(await fs.readFile(path.join(questionDirectory, group.file), 'utf8'));
    assert.equal(payload.questions.length, group.availableCount, `Index count mismatch: ${group.file}`);
    assert.equal(payload.unavailable.length, group.unavailableCount, `Index exclusion count mismatch: ${group.file}`);
    report.available += group.availableCount; report.unavailable += group.unavailableCount; report.questions += group.totalCount;
    for (const question of [...payload.questions, ...payload.unavailable]) {
      assert(!ids.has(question.id), `Duplicate imported question ID: ${question.id}`); ids.add(question.id);
    }
    for (const question of payload.unavailable) for (const reason of question.reasons ?? [question.reason]) report.reasons[reason] = (report.reasons[reason] ?? 0) + 1;
  }
  await fs.mkdir(questionDirectory, {recursive: true});
  for (const [file, payload] of replacements) await fs.writeFile(path.join(questionDirectory, file), `${JSON.stringify(payload, null, 2)}\n`);
  const manifest = {...previous, groups, report};
  await fs.writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.rename(`${manifestPath}.tmp`, manifestPath);
  const summary = {format: converter, files: exams.length, written: 0, available: 0, unavailable: 0, listeningSkipped: 0, papers: exams.map(exam => exam.report)};
  for (const exam of exams) for (const field of ['written', 'available', 'unavailable', 'listeningSkipped']) summary[field] += exam.report[field];
  if (reportFile) await fs.writeFile(reportFile, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function indexGroup(file, payload) {
  return {level: payload.level, period: payload.period, type: payload.type, file, sourceFile: payload.sourceFile,
    availableCount: payload.questions.length, unavailableCount: payload.unavailable.length, totalCount: payload.questions.length + payload.unavailable.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); assert(index < 0 || args[index + 1] && !args[index + 1].startsWith('--'), `${name} requires a value`); return index < 0 ? null : path.resolve(args[index + 1]); };
  const sourceDirectory = value('--source');
  assert(sourceDirectory, 'Usage: node scripts/import-exam-bank.mjs --source <exam JSON directory> [--output <bank directory>] [--report <report.json>]');
  const result = await importExamBanks({sourceDirectory, outputDirectory: value('--output') ?? path.join(root, 'src/data/imported-bank'), reportFile: value('--report')});
  console.log(JSON.stringify(result, (key, value) => key === 'sectionCounts' ? undefined : value, 2));
}
