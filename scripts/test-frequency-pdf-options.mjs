import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createFrequencyPdf, createFrequencyWorkbook} from '../src/lib/frequency-export.mjs';
import {defaultFrequencyPdfOptions, parseFrequencyPdfOptions} from '../src/lib/frequency-pdf-options.mjs';
import {defaultFrequencyFilters, FrequencyInputError} from '../src/lib/bank-frequency.mjs';
import ExcelJS from 'exceljs';

const metadata = {subtypes: [], referenceSource: {name: 'Reference source', license: 'CC BY-SA 4.0', url: 'https://example.org/reference'}};
const result = {filters: {...defaultFrequencyFilters, source: 'imported', level: 'N1', grade: 'N1', order: 'alphabetical'}, revision: 'test', total: 2, rows: [
  {rank: 1, label: '余地', reading: 'よち', referenceLevels: ['N1'], pos: '名词', occurrences: 9, questions: 12, papers: 5, definition: {meaning: '空余的地方；回旋的空间', usage: '名词，用于表示空间或可能性。', source: 'editorial'}},
  {rank: 2, label: '誇張', reading: 'こちょう', referenceLevels: ['N1'], pos: '名词', occurrences: 5, questions: 12, papers: 5, definition: {meaning: '夸张；夸大', source: 'editorial'}},
]};
async function inspect(options, data = result) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jlpt-pdf-test-'));
  try {
    const file = path.join(dir, 'export.pdf');
    fs.writeFileSync(file, await createFrequencyPdf(data, metadata, 'zh', new Date('2026-10-21'), undefined, options));
    return {text: execFileSync('pdftotext', ['-layout', file, '-'], {encoding: 'utf8'}), info: execFileSync('pdfinfo', [file], {encoding: 'utf8'})};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
test('PDF options preserve defaults, permit term-only exports, and reject unsupported or ambiguous input', () => {
  assert.deepEqual(parseFrequencyPdfOptions(new URLSearchParams()), defaultFrequencyPdfOptions);
  assert.deepEqual(parseFrequencyPdfOptions(new URLSearchParams('pdfFields=')).fields, []);
  for (const query of ['pdfLayout=html', 'pdfPaper=A0', 'pdfFontSize=99', 'pdfOrientation=diagonal', 'pdfFields=rank,rank', 'pdfFields=unknown', 'pdfFields=rank,,reading']) assert.throws(() => parseFrequencyPdfOptions(new URLSearchParams(query)), FrequencyInputError);
});
test('detailed PDF preserves readings and grades together and marks unofficial grading only once', async () => {
  const {text, info} = await inspect(defaultFrequencyPdfOptions);
  assert.match(text, /よち · N1/); assert.match(text, /こちょう · N1/);
  assert.match(text, /出现次数/); assert.match(text, /用法／接续/); assert.equal(text.match(/非官方/g)?.length, 1);
  assert.match(info, /A4/); assert.ok(text.indexOf('余地') < text.indexOf('誇張'));
  assert.match(text.split('\f')[0], /余地/, 'page footer must not create an empty first page');
});
test('table exports obey hidden fields and use landscape A5 without losing terms or meanings', async () => {
  const {text, info} = await inspect({layout: 'table', paper: 'A5', orientation: 'landscape', fontSize: 13, fields: ['meaning']});
  for (const label of ['出现次数', '覆盖题目', '覆盖场次', 'よち', 'こちょう', '用法／接续']) assert.ok(!text.includes(label), label);
  assert.match(text, /空余的地方/); assert.match(text.split('\f')[0], /余地/, 'landscape export must start with data on page one'); assert.match(text, /夸张/); assert.match(info, /595\.28 x 419\.53 pts/);
});
test('large definitions paginate in both layouts and retain the ending with repeated table headings', async () => {
  const large = {...result, total: 1, rows: [{...result.rows[0], definition: {meaning: '长释义内容'.repeat(400) + '末尾校验标记', source: 'editorial'}}]};
  for (const layout of ['detailed', 'table']) {
    const {text, info} = await inspect({...defaultFrequencyPdfOptions, layout, paper: 'A5', fontSize: 13, fields: ['meaning']}, large);
    assert.match(text.replace(/\s/g, ''), /末尾校验标记/); assert.ok(Number(info.match(/Pages:\s+(\d+)/)[1]) > 1);
    assert.ok(text.split('题库词频统计').length > 2);
  }
});
test('Excel keeps all data and its schema regardless of PDF presentation settings', async () => {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await createFrequencyWorkbook(result, metadata));
  const sheet = book.worksheets[0]; assert.equal(sheet.getCell('E2').value, 9); assert.equal(sheet.getCell('C2').value, 'よち');
  assert.equal(sheet.getCell('H2').value, result.rows[0].definition.meaning); assert.equal(sheet.getCell('K2').value, 'N1');
});
