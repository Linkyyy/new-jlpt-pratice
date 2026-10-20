import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { createFrequencyPdf, createFrequencyWorkbook, frequencyExportDescription } from '../src/lib/frequency-export.mjs';
import { defaultFrequencyFilters, queryFrequency, frequencyMetadata } from '../src/lib/bank-frequency.mjs';
const corpus = JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz', import.meta.url))));
const metadata = frequencyMetadata(corpus);
const filters = { ...defaultFrequencyFilters, source: 'original', level: 'N5', period: '2025', page: 2, size: 1, order: 'occurrences-asc' };
const all = queryFrequency(corpus, filters, undefined, { allRows: true });
const now = new Date('2026-10-20T00:00:00Z');

test('Excel is a real workbook containing all filtered rows, numeric counts and query provenance', async () => {
  assert.ok(all.total > 1); assert.equal(all.rows.length, all.total);
  const bytes = await createFrequencyWorkbook(all, metadata, 'zh', now);
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet('频率排名'), summary = workbook.getWorksheet('查询说明');
  assert.equal(sheet.rowCount, all.total + 1);
  assert.equal(sheet.getCell('B2').value, all.rows[0].label);
  assert.equal(sheet.getCell('E2').value, all.rows[0].occurrences);
  assert.equal(typeof sheet.getCell('E2').value, 'number');
  assert.equal(sheet.getCell(`A${sheet.rowCount}`).value, all.total);
  assert.equal(summary.getCell('B3').value, all.total);
  assert.match(summary.getCell('B2').value, /2025/); assert.match(summary.getCell('B2').value, /N5/); assert.match(summary.getCell('B2').value, /少到多/);
  assert.equal(sheet.views[0].state, 'frozen'); assert.ok(sheet.autoFilter);
});
test('spreadsheet text remains text even when it starts like a formula', async () => {
  const result = { ...all, total: 1, rows: [{ ...all.rows[0], label: '=HYPERLINK("https://example.com")', reading: '+cmd' }] };
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await createFrequencyWorkbook(result, metadata));
  assert.equal(workbook.worksheets[0].getCell('B2').type, ExcelJS.ValueType.String);
  assert.equal(workbook.worksheets[0].getCell('B2').value, result.rows[0].label);
});
test('PDF is complete and embeds a CJK font plus a Unicode text map', async () => {
  const bytes = await createFrequencyPdf(all, metadata, 'zh', now);
  const text = bytes.toString('latin1');
  assert.match(text, /^%PDF-/); assert.match(text, /%%EOF\s*$/);
  assert.match(text, /\/ToUnicode/); assert.match(text, /\/FontFile3/);
  assert.ok(bytes.length > 10000);
});
test('English and Japanese exports preserve Japanese terms and localized headings', async () => {
  for (const [locale, name, header] of [['en','Frequency ranking','Term'], ['ja','頻度ランキング','語句']]) {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await createFrequencyWorkbook(all, metadata, locale, now));
    assert.equal(book.getWorksheet(name).getCell('B1').value, header);
    assert.equal(book.getWorksheet(name).getCell('B2').value, all.rows[0].label);
  }
  assert.match(frequencyExportDescription(filters, metadata, 'en'), /ascending/);
});
test('exports reject a page-only payload instead of silently losing rows and allow an empty result', async () => {
  const page = queryFrequency(corpus, filters);
  await assert.rejects(createFrequencyWorkbook(page, metadata), /entire filtered result/);
  await assert.rejects(createFrequencyPdf(page, metadata), /entire filtered result/);
  const empty = { ...all, total: 0, rows: [] };
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await createFrequencyWorkbook(empty, metadata));
  assert.equal(book.worksheets[0].rowCount, 1);
  assert.match((await createFrequencyPdf(empty, metadata)).toString('latin1'), /%%EOF\s*$/);
});

test('exclusive exports preserve all filtered terms and explain the global lower-level comparison in each language', async () => {
  const result = queryFrequency(corpus, { ...defaultFrequencyFilters, exclusive: 'N2', level: 'N2', size: 1, page: 2 }, undefined, { allRows: true });
  assert.ok(result.total > 1);
  for (const [locale, pattern, note] of [['zh', /N2 及以上独有/, /全部题库、场次、题型和文本/], ['ja', /N2 以上のみ/, /全問題集/], ['en', /N2 and above only/, /all banks, sessions, categories and text/]]) {
    const description = frequencyExportDescription(result.filters, metadata, locale);
    assert.match(description, pattern); assert.match(description, note);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await createFrequencyWorkbook(result, metadata, locale, now));
    assert.equal(book.worksheets[0].rowCount, result.total + 1);
    assert.deepEqual(book.worksheets[0].getColumn('B').values.slice(2), result.rows.map(row => row.label));
    assert.match(book.worksheets[1].getCell('B2').value, note);
  }
  assert.match((await createFrequencyPdf({ ...result, total: 5, rows: result.rows.slice(0, 5) }, metadata, 'en', now)).toString('latin1'), /%%EOF\s*$/);
});

test('Excel includes actual Chinese meanings, grammar usage, conjunction POS and reusable source attribution',async()=>{
  for(const filters of [{kind:'grammar',q:'にしては'},{kind:'word',pos:'接续词',q:'しかし'}]){
    const result=queryFrequency(corpus,{...defaultFrequencyFilters,...filters},undefined,{allRows:true});assert.ok(result.total>0);
    const book=new ExcelJS.Workbook();await book.xlsx.load(await createFrequencyWorkbook(result,metadata,'zh',now));const sheet=book.worksheets[0];
    assert.equal(sheet.getCell('H1').value,'中文释义');assert.equal(sheet.getCell('I1').value,'用法／接续');
    assert.equal(sheet.getCell('H2').value,result.rows[0].definition.meaning);assert.equal(sheet.getCell('I2').value,result.rows[0].definition.usage);
    if(filters.pos)assert.equal(sheet.getCell('D2').value,'接续词');
    assert.match(book.worksheets[1].getCell('B7').value,/CC BY-SA 4.0/);
  }
});
