import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import ExcelJS from 'exceljs';
import {mergeFrequencyDuplicateWords} from '../src/lib/frequency-duplicates.mjs';
import {queryFrequency, defaultFrequencyFilters, frequencyMetadata} from '../src/lib/bank-frequency.mjs';
import {createFrequencyWorkbook, createFrequencyPdf} from '../src/lib/frequency-export.mjs';
const require = createRequire(import.meta.url);
const query = (c, filters = {}, selected) => queryFrequency(c, {...defaultFrequencyFilters, ...filters}, selected);
function fixture() {
  return {terms: [['安静','あんせい','名词','word'],['安静','あんせい','形容词','word'],['はく','はく','名词','word'],['はく','はく','动词','word'],['安静','べつ','名词','word']],
    definitions: [{meaning:'安静；静养',usage:'',source:'wiktionary'},{meaning:'安静的',usage:'',source:'wiktionary'},...Array.from({length:3},()=>({meaning:'',usage:'',source:'missing'}))],
    aliases: [[],['あんせい'],[],[],[]], referenceLevels: [['N1'],['N1'],[],[],[]], compounds:[false,true,false,false,false],
    units: [['prompt',[0,1],[0,3,1,2,2,1,3,1,4,1]], ['options',[1],[1,1]]],
    questions: [['a','imported','N1','202412','vocabulary','test',1,true,0],['b','imported','N1','202412','vocabulary','test',2,true,0]],
    papers:[['imported','N1','202412']],summary:{terms:5},revision:'test',subtypes:[],version:1};
}
test('noun/adjective duplicates become one multi-POS entry with preserved meanings, aliases and deduplicated source coverage', () => {
  const c=fixture(), before=query(c).totalOccurrences, report=mergeFrequencyDuplicateWords(c,{});
  assert.equal(report.groups,1); assert.equal(report.removedRows,1); assert.equal(c.terms.length,4);
  assert.deepEqual(c.partsOfSpeech[0],['名词','形容词']);assert.deepEqual(c.aliases[0],['あんせい']);
  assert.match(c.definitions[0].meaning,/静养/);assert.match(c.definitions[0].meaning,/安静的/);
  assert.deepEqual(c.referenceLevels[0],['N1']);assert.equal(c.compounds[0],true);
  const row=query(c,{q:'安静'}).rows.find(r=>r.reading==='あんせい');assert.equal(row.occurrences,6);assert.equal(row.questions,2);assert.equal(row.papers,1);
  assert.equal(query(c).totalOccurrences,before);
  for(const pos of ['名词','形容词'])assert.ok(query(c,{q:'安静',pos}).rows.some(r=>r.id===row.id));
  assert.equal(query(c,{q:'安静'},row.id).detail.exampleTotal,2);
  assert.equal(mergeFrequencyDuplicateWords(c,{}).removedRows,0);
});
test('homonyms, ambiguous kana dictionary spellings, different readings and different expression kinds stay separate', () => {
  const c=fixture();c.terms.push(['さかん','さかん','名词','word'],['さかん','さかん','形容词','word'],['安静','あんせい','语法表达','grammar']);
  c.definitions.push(...Array.from({length:3},()=>({meaning:'',usage:'',source:'missing'})));
  mergeFrequencyDuplicateWords(c,{'さかん':[{word:'左官',pos:'noun',readings:['さかん']},{word:'盛ん',pos:'adj',readings:['さかん']}]});
  assert.equal(c.terms.filter(t=>t[0]==='はく').length,2);
  assert.equal(c.terms.filter(t=>t[0]==='さかん').length,2);
  assert.equal(c.terms.filter(t=>t[0]==='安静').length,3);
});
test('actual index has one 安静 row, both POS filters and exported files retain the combined entry', async () => {
  const c=JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz',import.meta.url))));
  const report=JSON.parse(fs.readFileSync(new URL('../src/data/bank-frequency/quality-report.json',import.meta.url))).duplicates;
  assert.ok(report.groups>100);assert.ok(report.removedRows>=report.groups);
  const result=query(c,{q:'安静'});assert.equal(result.total,1);const row=result.rows[0];assert.equal(row.occurrences,5);assert.equal(row.questions,1);assert.deepEqual(row.partsOfSpeech,['名词','形容词']);
  for(const pos of row.partsOfSpeech)assert.equal(query(c,{q:'安静',pos}).total,1);
  const book=new ExcelJS.Workbook();await book.xlsx.load(await createFrequencyWorkbook(result,frequencyMetadata(c)));
  assert.equal(book.worksheets[0].rowCount,2);assert.equal(book.worksheets[0].getCell('D2').value,'名词 / 形容词');assert.equal(book.worksheets[0].getCell('E2').value,5);
  assert.match((await createFrequencyPdf(result,frequencyMetadata(c))).toString('latin1'),/^%PDF-/);
  assert.equal(c.partsOfSpeech.length,c.terms.length);assert.equal(c.aliases.length,c.terms.length);assert.equal(c.definitions.length,c.terms.length);
  assert.equal(c.questions.length,8759);
});
test('saved legacy noun and adjective semantic links both resolve to the merged word', () => {
  const exports={};const source=fs.readFileSync(new URL('../src/lib/bank-frequency.server.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>name.startsWith('@/')?{}:require(name)});
  const c=fixture();mergeFrequencyDuplicateWords(c,{});
  for(const pos of ['名词','形容词'])assert.equal(exports.findFrequencyTerm(c,{kind:'word',label:'安静',reading:'あんせい',pos}),0);
  assert.equal(exports.findFrequencyTerm(c,{kind:'word',label:'あんせい',reading:'あんせい',pos:'形容词'}),0);
  assert.equal(exports.findFrequencyTerm(c,{kind:'word',label:'安静',reading:'ちがう',pos:'名词'}),-1);
});
