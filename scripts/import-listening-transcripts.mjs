import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {convertExamBank} from './import-exam-bank.mjs';
import {frequencyText} from '../src/lib/bank-frequency.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const generator = 'jlpt-practice/listening-transcripts/v1';
const digest = value => createHash('sha256').update(value).digest('hex');
const text = value => typeof value === 'string' ? value.replace(/<\/?MOJiTest_URL\s*>/gi, '').replace(/\r\n?/g, '\n').trim() : '';
const letters = ['A', 'B', 'C', 'D'];

/** Statistics sources are kept separate from the practice bank: no audio means no playable questions. */
export function extractListeningTranscripts(input, {sourceFile, checksum = digest(JSON.stringify(input))} = {}) {
  const {report} = convertExamBank(input, {sourceFile, checksum});
  const {level, period} = report, questions = [], passages = new Set(), numbers = new Set(), warnings = [];
  const sections = new Map(input.sections.map(section => [section.objectId, section]));
  for (const parent of input.items) {
    const section = sections.get(parent._parent.sectionId);
    if (Math.floor(section.questionType / 10) !== 4) continue;
    for (const row of parent.items?.length ? parent.items : [parent]) {
      const childTranscript = text(row.subtitle);
      const transcript = frequencyText(childTranscript) ? childTranscript : text(parent.subtitle);
      if (!/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(frequencyText(transcript))) {
        warnings.push({objectId: row.objectId, reason: 'Missing Japanese transcript'}); continue;
      }
      const identity = row.identity?.find(value => typeof value === 'string' && value.startsWith(`${period}${level}`));
      const number = identity?.split('*')[0].match(/(\d{3})$/);
      assert(number, `Invalid listening identity: ${row.objectId}`);
      const questionNumber = Number(number[1]);
      assert(!numbers.has(questionNumber), `Duplicate listening question number: ${identity}`); numbers.add(questionNumber);
      const sourceId = Number.parseInt(digest(`${input.exam.id}:${row.objectId}`).slice(0, 12), 16);
      const id = `imported:${period}:${level}:4:${sourceId}:${questionNumber}`;
      const options = (row.options ?? []).map((value, index) => ({id: letters[index], label: String(index + 1), text: text(value)}));
      questions.push({id, source: 'imported', period, level, category: '听力', instruction: text(section.title), prompt: '', options,
        explanation: [`<p>听力原文</p>${transcript}`], sourceQuestionNumber: questionNumber, available: false,
        sourceObjectId: row.objectId, sourceParentId: parent.objectId, sourceIdentity: identity});
      passages.add(frequencyText(transcript));
    }
  }
  assert(questions.length, `No Japanese listening transcripts found: ${sourceFile}`);
  return {version: 1, generatedBy: generator, sourceFile, checksum, level, period,
    questionCount: questions.length, passageCount: passages.size, missingTranscripts: report.listeningSkipped - questions.length, warnings, questions};
}

export async function importListeningTranscripts({sourceDirectory, outputDirectory}) {
  const files = (await fs.readdir(sourceDirectory)).filter(file => file.endsWith('.json')).sort();
  assert(files.length, 'No JSON exam exports found');
  const incoming = new Map();
  for (const sourceFile of files) {
    const bytes = await fs.readFile(path.join(sourceDirectory, sourceFile));
    const source = extractListeningTranscripts(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')), {sourceFile, checksum: digest(bytes)});
    const file = `${source.period}-${source.level}.json`;
    assert(!incoming.has(file), `Multiple files for the same listening exam: ${file}`); incoming.set(file, source);
  }
  const directory = path.join(outputDirectory, 'exams'), indexPath = path.join(outputDirectory, 'index.json');
  let old = {version: 1, generatedBy: generator, groups: []};
  try { old = JSON.parse(await fs.readFile(indexPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert.equal(old.generatedBy, generator, 'Refusing to overwrite unmanaged transcript sources');
  const sources = new Map();
  for (const group of old.groups) {
    assert(/^\d{6}-N[1-5]\.json$/.test(group.file), 'Invalid transcript filename');
    sources.set(group.file, JSON.parse(await fs.readFile(path.join(directory, group.file), 'utf8')));
  }
  for (const [file, source] of incoming) sources.set(file, source);
  const ids = new Set();
  for (const source of sources.values()) for (const question of source.questions) {
    assert(question.available === false, 'Transcript sources cannot enable practice');
    assert(!ids.has(question.id), `Duplicate transcript question: ${question.id}`); ids.add(question.id);
  }
  const groups = [...sources].sort(([a], [b]) => a.localeCompare(b)).map(([file, source]) => ({file, level: source.level, period: source.period,
    questionCount: source.questionCount, passageCount: source.passageCount, missingTranscripts: source.missingTranscripts}));
  const summary = {version: 1, generatedBy: generator, questionCount: groups.reduce((n, row) => n + row.questionCount, 0),
    passageCount: groups.reduce((n, row) => n + row.passageCount, 0), groups};
  await fs.mkdir(directory, {recursive: true});
  for (const [file, source] of incoming) await fs.writeFile(path.join(directory, file), `${JSON.stringify(source, null, 2)}\n`);
  await fs.writeFile(`${indexPath}.tmp`, `${JSON.stringify(summary, null, 2)}\n`); await fs.rename(`${indexPath}.tmp`, indexPath);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); assert(index < 0 || args[index + 1] && !args[index + 1].startsWith('--'), `${name} requires a value`); return index < 0 ? null : path.resolve(args[index + 1]); };
  const sourceDirectory = value('--source');
  assert(sourceDirectory, 'Usage: node scripts/import-listening-transcripts.mjs --source <exam JSON directory> [--output <statistics source directory>]');
  console.log(JSON.stringify(await importListeningTranscripts({sourceDirectory, outputDirectory: value('--output') ?? path.join(root, 'src/data/frequency-listening')}), null, 2));
}
