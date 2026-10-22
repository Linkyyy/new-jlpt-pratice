import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import ExcelJS from 'exceljs';
import {mergeFrequencyDuplicateWords} from '../src/lib/frequency-duplicates.mjs';
import {mergeFrequencyWordVariants} from '../src/lib/frequency-variants.mjs';
import {annotateFrequencySupplements} from '../src/lib/frequency-review.mjs';
import {correctFrequencyReadings} from '../src/lib/frequency-quality.mjs';
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
  assert.equal(report.groups,2); assert.equal(report.removedRows,2); assert.equal(c.terms.length,3);
  assert.deepEqual(c.partsOfSpeech[0],['名词','形容词']);assert.deepEqual(c.aliases[0],['あんせい']);
  assert.match(c.definitions[0].meaning,/静养/);assert.match(c.definitions[0].meaning,/安静的/);
  assert.deepEqual(c.referenceLevels[0],['N1']);assert.equal(c.compounds[0],true);
  const row=query(c,{q:'安静'}).rows.find(r=>r.reading==='あんせい');assert.equal(row.occurrences,6);assert.equal(row.questions,2);assert.equal(row.papers,1);
  assert.equal(query(c).totalOccurrences,before);
  for(const pos of ['名词','形容词'])assert.ok(query(c,{q:'安静',pos}).rows.some(r=>r.id===row.id));
  assert.equal(query(c,{q:'安静'},row.id).detail.exampleTotal,2);
  assert.equal(mergeFrequencyDuplicateWords(c,{}).removedRows,0);
});
test('identical headwords aggregate POS while distinct readings and expression kinds stay separate', () => {
  const c=fixture();c.terms.push(['さかん','さかん','名词','word'],['さかん','さかん','形容词','word'],['安静','あんせい','语法表达','grammar']);
  c.definitions.push(...Array.from({length:3},()=>({meaning:'',usage:'',source:'missing'})));
  mergeFrequencyDuplicateWords(c,{'さかん':[{word:'左官',pos:'noun',readings:['さかん']},{word:'盛ん',pos:'adj',readings:['さかん']}]});
  assert.equal(c.terms.filter(t=>t[0]==='はく').length,1);
  assert.deepEqual(c.partsOfSpeech[c.terms.findIndex(t=>t[0]==='はく')],['名词','动词']);
  assert.equal(c.terms.filter(t=>t[0]==='さかん').length,1);
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

test('reviewed kana/kanji variants merge transitively, preserve previous aliases and leave unrelated kana homophones separate', () => {
  const c=fixture();
  c.terms=[['バラバラ','ばらばら','副词','word'],['ばらばら','ばらばら','名词','word'],['生き生き','いきいき','副词','word'],['活き活き','いきいき','名词','word'],['いきいき','いきいき','副词','word'],['まま','まま','名词','word'],['ママ','まま','名词','word']];
  c.definitions=c.terms.map(([label])=>({meaning:label,usage:'',source:'editorial'}));
  c.aliases=c.terms.map((_,id)=>id===2?['生きいき']:[]);delete c.compounds;
  c.referenceLevels=c.terms.map((_,id)=>id===4?['N2']:[]);
  c.referenceBasis=c.terms.map((_,id)=>id===4?'reference':'ungraded');
  c.referenceEvidence=c.terms.map((_,id)=>id===4?[{name:'test',levels:['N2']}]:[]);
  c.units=[['prompt',[0,1],[0,1,1,2,2,3,3,4,4,5,5,1,6,1]]];
  const reviewed=JSON.parse(fs.readFileSync(new URL('../src/data/frequency-levels/variant-review.json',import.meta.url))).entries;
  const before=query(c).totalOccurrences,report=mergeFrequencyWordVariants(c,{},reviewed);
  assert.equal(report.mergedTerms,3);assert.equal(query(c).totalOccurrences,before);
  const row=query(c,{q:'活き活き'}).rows[0];assert.equal(row.label,'生き生き');assert.equal(row.occurrences,12);assert.equal(row.questions,2);
  assert.deepEqual(row.referenceLevels,['N2']);assert.equal(row.referenceBasis,'reference');
  assert.ok(row.aliases.includes('いきいき'));assert.ok(row.aliases.includes('生きいき'));
  assert.equal(c.referenceEvidence[row.id][0].name,'test');
  assert.equal(c.terms.filter(t=>['ママ','まま'].includes(t[0])).length,2);
  assert.equal(mergeFrequencyWordVariants(c,{},reviewed).mergedTerms,0);
  assert.deepEqual(query(c,{q:'活き活き'}).rows[0].aliases,row.aliases);
});

test('POS-specific reviewed levels cannot spill into a homophone and retain their precise source', () => {
  const c={terms:[['かつ','かつ','动词','word'],['かつ','かつ','接续词','connective'],['よく','よく','名词','word']],referenceLevels:[[],[],[]]};
  const reviewed=[{kind:'word',label:'かつ',reading:'かつ',pos:['接续词'],levels:['N1'],method:'reviewed-word-sense',source:{name:'exact source',url:'https://example.com/reference',revision:'pinned',license:'test'}},{kind:'word',label:'かつ',reading:'かつ',pos:['动词'],levels:['N3'],method:'editorial'}];
  annotateFrequencySupplements(c,[],reviewed,{name:'generic source'});
  assert.deepEqual(c.referenceLevels,[['N3'],['N1'],[]]);
  assert.equal(c.referenceEvidence[1][0].name,'exact source');
  assert.deepEqual(c.referenceBasis,['editorial','supplemental','ungraded']);
});

test('production has no duplicate word headwords and both user examples retain cumulative source counts', () => {
  const c=JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz',import.meta.url))));
  const words=c.terms.filter(t=>['word','connective'].includes(t[3]));
  assert.equal(new Set(words.map(t=>`${t[0].normalize('NFKC')}\t${t[1]}`)).size,words.length);
  for (const [canonical,alias,occurrences] of [['ばらばら','バラバラ',19],['生き生き','活き活き',26]]) {
    const result=query(c,{q:alias}),row=result.rows.find(row=>row.label===canonical);
    assert.ok(row,alias);assert.equal(result.total,1);assert.equal(row.occurrences,occurrences);
    assert.ok(query(c,{q:canonical}).rows.some(other=>other.id===row.id));
    assert.ok(row.partsOfSpeech.length>1);assert.equal(query(c,{q:alias},row.id).detail.exampleTotal,row.questions);
  }
  const exports={};const source=fs.readFileSync(new URL('../src/lib/bank-frequency.server.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>name.startsWith('@/')?{}:require(name)});
  const ids=[['バラバラ','ばらばら','副词'],['ばらばら','ばらばら','名词']].map(([label,reading,pos])=>exports.findFrequencyTerm(c,{kind:'word',label,reading,pos}));
  assert.ok(ids[0]>=0);assert.equal(ids[0],ids[1]);
});


test('十分 adjective reading is corrected without changing ten-minute nouns, and old saved links still resolve', () => {
  const c={terms:[['十分','じゅうふん','形容词','word'],['十分','じゅうふん','名词','word']]};
  const report=correctFrequencyReadings(c,{'十分':[{readings:['じゅうぶん']}]});
  assert.equal(report.length,1);assert.deepEqual(c.terms.map(t=>t[1]),['じゅうぶん','じゅうふん']);
  assert.deepEqual(c.readingAliases,[['じゅうふん'],[]]);
  const exports={};const source=fs.readFileSync(new URL('../src/lib/bank-frequency.server.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>name.startsWith('@/')?{}:require(name)});
  for (const reading of ['じゅうふん','じゅうぶん']) assert.equal(exports.findFrequencyTerm(c,{kind:'word',label:'十分',reading,pos:'形容词'}),0);
});
