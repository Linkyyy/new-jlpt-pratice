import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifiedReadingImageKeys} from './verify-reading-images.mjs';
import {getImageObjectKey} from '../src/lib/image-url.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const generator = 'jlpt-practice/import-question-bank/v1';
const converter = 'jlpt-practice/import-exam-bank/v1';
const types = {1: 'vocabulary', 2: 'grammar', 3: 'reading'};
const categories = {1: '词汇', 2: '语法', 3: '阅读'};
const letters = ['A', 'B', 'C', 'D'];
const text = value => typeof value === 'string' ? value.replace(/<\/?MOJiTest_URL\s*>/gi, '').replace(/\r\n?/g, '\n').trim() : '';
const visible = value => text(value).replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim();
const digest = value => createHash('sha256').update(value).digest('hex');
const readingProblemNumbers = {
  N1: {31: 8, 32: 9, 33: 10, 34: 11, 35: 12, 36: 13},
  N2: {31: 10, 32: 11, 34: 12, 35: 13, 36: 14},
  N3: {31: 4, 32: 5, 33: 6, 36: 7},
  N4: {31: 4, 32: 5, 36: 6}, N5: {31: 4, 32: 5, 36: 6},
};

export function examInstruction(section, level) {
  const instruction = text(section.title), expected = readingProblemNumbers[level]?.[section.questionType];
  return expected ? instruction.replace(/(問[題题]\s*)[\d０-９]+/, (_, prefix) => `${prefix}${expected}`) : instruction;
}

function sourceIdentity(row, period, level) {
  const identity = row.identity?.find(value => typeof value === 'string' && value.startsWith(`${period}${level}`));
  assert(identity, `Missing or mismatched identity: ${row.objectId}`);
  const [prefix, printed] = identity.split('*');
  const number = prefix.match(/(\d{3})(?:-\d{3})?$/);
  assert(number && /^\d+$/.test(printed), `Invalid written question number: ${identity}`);
  // N3 vocabulary and grammar/reading have separate printed numbering.
  return {identity, number: Number(printed), globalNumber: Number(number[1])};
}

function readingImageNames(input, sections, period, level) {
  const images = new Map();
  const assign = (reference, name) => { if (text(reference) && !images.has(text(reference))) images.set(text(reference), name); };
  const rows = input.items.filter(row => Math.floor(sections.get(row?._parent?.sectionId)?.questionType / 10) === 3)
    .filter(row => text(row.imageId) || row.items?.some(child => text(child.imageId)))
    .map(row => ({row, children: row.items?.length ? row.items : [row]}))
    .map(item => ({...item, first: Math.min(...item.children.map(child => sourceIdentity(child, period, level).number))}))
    .sort((a, b) => a.first - b.first);
  for (const {row, children, first} of rows) {
    // Match the established pic/320140773.jpg and pic/320140773-1.jpg convention.
    const stem = `pic/${level.slice(1)}${period}${first}`;
    assign(row.imageId, `${stem}.jpg`);
    if (children[0] !== row) children.forEach((child, index) => assign(child.imageId, `${stem}-${index + 1}.jpg`));
  }
  assert.equal(new Set(images.values()).size, images.size, 'Different source images cannot share an upload filename');
  return images;
}

/** Convert the nested exam export without changing the application's question schema. */
export function convertExamBank(input, {sourceFile, checksum = digest(JSON.stringify(input)), availableImages = new Set()} = {}) {
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
  const uploadNames = readingImageNames(input, sections, period, level);
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
    const instruction = examInstruction(section, level);
    const passage = parent ? text(parent.title) : '';
    const title = text(row.title);
    const prompt = visible(title) ? title : parent ? `请选择第 ${source.number} 题的答案（对应文章中的题号）。` : '';
    const options = Array.isArray(row.options) ? row.options.map((value, index) => ({id: letters[index], label: String(index + 1), text: text(value)})) : [];
    const answer = /^(?:0|1|2|3)$/.test(String(row.rightAnswer)) ? Number(row.rightAnswer) : -1;
    const explanation = [text(row.analysis) || '该题库未提供解析。'];
    if (text(parent?.translation)) explanation.push(`<p><strong>文章译文</strong></p>${text(parent.translation)}`);
    const parentImage = text(parent?.imageId), questionImage = text(row.imageId);
    const uploadImages = {passage: uploadNames.get(parentImage) ?? parentImage, question: uploadNames.get(questionImage) ?? questionImage};
    const reasons = [];
    if (!visible(prompt)) reasons.push('题干缺失');
    if (options.length !== 4 || options.some(option => !visible(option.text)) || answer < 0 || answer >= options.length) reasons.push('选项或答案不完整');
    if ([uploadImages.passage, uploadImages.question].filter(Boolean).some(key => getImageObjectKey(key) !== key || !availableImages.has(key))) reasons.push('缺少配套图片');
    if (parent && !visible(passage) && !parentImage) reasons.push('文章缺失');
    const articleImage = parent ? uploadImages.passage : uploadImages.question;
    const ownImage = parent && uploadImages.question !== uploadImages.passage ? uploadImages.question : '';
    const question = {id, level, category: categories[type], prompt, ...(passage ? {passage} : {}), ...(instruction ? {instruction} : {}), richText: true,
      options, correctOptionId: letters[answer] ?? null, explanation, sourceQuestionNumber: source.number, sourceId,
      ...(articleImage || ownImage ? {media: {images: articleImage ? [articleImage] : [], ...(ownImage ? {questionImages: [ownImage]} : {})}} : {})};
    group.sourceMetadata.questions.push({id, objectId: row.objectId, identity: source.identity, globalQuestionNumber: source.globalNumber,
      sectionId: section.objectId, questionType: section.questionType, ...(parent ? {parentObjectId: parent.objectId} : {}),
      ...(instruction !== text(section.title) ? {originalInstruction: text(section.title)} : {}),
      ...(parentImage || questionImage ? {images: {passage: parentImage, question: questionImage}, uploadImages} : {})});
    if (reasons.length) {
      // Keep the established unavailable-record shape so resource checks and text statistics still work.
      const raw = {id: sourceId, time: period, level, type, questionId: source.number, bigTitle: instruction,
        question: prompt, littleQuestion: prompt, article: passage, answer: answer + 1, assistantNew: explanation.join('\n\n'),
        picture: uploadImages.passage || uploadImages.question, ...(questionImage ? {questionPicture: uploadImages.question} : {}),
        ...Object.fromEntries(options.map((option, index) => [`option${index + 1}`, option.text]))};
      group.unavailable.push({id, sourceId, questionNumber: source.number, reasons,
        media: {picture: uploadImages.passage || uploadImages.question, ...(questionImage ? {questionPicture: uploadImages.question} : {}), audio: ''}, raw});
    } else group.questions.push(question);
    if (row.questionType !== section.questionType) warnings.push({id, issue: 'question-type-mismatch', sourceType: row.questionType, sectionType: section.questionType, resolution: 'Use the enclosing section type'});
    if (instruction !== text(section.title)) warnings.push({id, issue: 'problem-number-mismatch', original: text(section.title), resolved: instruction, resolution: 'Use the official reading problem number for the source section type and level'});
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
export async function importExamBanks({sourceDirectory, outputDirectory, reportFile, imageReportFile, verifiedImagesFile, uploadedImagesFile}) {
  let verification;
  const persistedVerification = path.join(outputDirectory, 'verified-reading-images.json');
  try { verification = JSON.parse(await fs.readFile(verifiedImagesFile ?? persistedVerification, 'utf8')); }
  catch (error) { if (verifiedImagesFile || error.code !== 'ENOENT') throw error; }
  const availableImages = verification ? verifiedReadingImageKeys(verification) : new Set();
  // An explicit owner confirmation can enable uploaded resources without claiming an HTTP check passed.
  const persistedUploads = path.join(outputDirectory, 'uploaded-reading-images.json');
  let uploads;
  if (uploadedImagesFile) {
    const checklist = JSON.parse(await fs.readFile(uploadedImagesFile, 'utf8'));
    assert(Array.isArray(checklist.images) && checklist.images.length, 'Missing uploaded reading image checklist');
    uploads = {version: 1, source: 'owner-confirmed', confirmedAt: new Date().toISOString(), images: [...new Set(checklist.images.map(image => image.uploadPath))]};
  } else {
    try { uploads = JSON.parse(await fs.readFile(persistedUploads, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (uploads) {
    assert(uploads.version === 1 && uploads.source === 'owner-confirmed' && Number.isFinite(Date.parse(uploads.confirmedAt))
      && Array.isArray(uploads.images) && uploads.images.length && uploads.images.every(key => getImageObjectKey(key) === key), 'Invalid uploaded reading image confirmation');
    for (const key of uploads.images) availableImages.add(key);
  }
  const files = (await fs.readdir(sourceDirectory)).filter(file => file.endsWith('.json')).sort();
  assert(files.length, 'No JSON exam exports found');
  const exams = [], selected = new Set();
  for (const sourceFile of files) {
    const bytes = await fs.readFile(path.join(sourceDirectory, sourceFile));
    const result = convertExamBank(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')), {sourceFile, checksum: digest(bytes), availableImages});
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
  if (verification) await fs.writeFile(persistedVerification, `${JSON.stringify(verification, null, 2)}\n`);
  if (uploads) await fs.writeFile(persistedUploads, `${JSON.stringify(uploads, null, 2)}\n`);
  const summary = {format: converter, files: exams.length, written: 0, available: 0, unavailable: 0, listeningSkipped: 0, papers: exams.map(exam => exam.report)};
  for (const exam of exams) for (const field of ['written', 'available', 'unavailable', 'listeningSkipped']) summary[field] += exam.report[field];
  if (reportFile) await fs.writeFile(reportFile, `${JSON.stringify(summary, null, 2)}\n`);
  if (imageReportFile) {
    const images = new Map();
    for (const {report: paper, groups} of exams) for (const {payload} of groups) for (const question of payload.sourceMetadata.questions) {
      for (const [kind, reference] of Object.entries(question.images ?? {})) {
        if (!reference) continue;
        const uploadPath = question.uploadImages[kind];
        if (!images.has(reference)) images.set(reference, {reference, uploadPath, questions: []});
        assert.equal(images.get(reference).uploadPath, uploadPath, 'Inconsistent upload mapping');
        images.get(reference).questions.push({id: question.id, period: paper.period, level: paper.level, kind});
      }
    }
    await fs.writeFile(imageReportFile, `${JSON.stringify({images: [...images.values()]}, null, 2)}\n`);
  }
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
  assert(sourceDirectory, 'Usage: node scripts/import-exam-bank.mjs --source <exam JSON directory> [--output <bank directory>] [--report <report.json>] [--image-report <images.json>] [--verified-images <verification.json>] [--uploaded-images <owner-confirmed-checklist.json>]');
  const result = await importExamBanks({sourceDirectory, outputDirectory: value('--output') ?? path.join(root, 'src/data/imported-bank'), reportFile: value('--report'), imageReportFile: value('--image-report'), verifiedImagesFile: value('--verified-images'), uploadedImagesFile: value('--uploaded-images')});
  console.log(JSON.stringify(result, (key, value) => key === 'sectionCounts' ? undefined : value, 2));
}
