import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const model={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/term-study-data.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:model});
const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/term-card-export.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,URLSearchParams,require:()=>model});
const card={kind:'word',label:'華々しい',reading:'はなばなしい',pos:'形容词',meaning:'华丽；壮烈',usage:'用于表现或活动',referenceLevels:['N1'],example:{text:'華々しい活躍でした。',path:'/practice?question=sample&source=imported',label:'N1 · 202412 · 1'}};
test('Anki TSV has recognized headers, exactly three columns, safe HTML and working semantic/source links',()=>{
 const text=exports.createAnkiText([card,card],'https://jlpt.example');assert.match(text,/#separator:tab/);assert.match(text,/#tags column:3/);const rows=text.split('\n').filter(row=>row&&!row.startsWith('#'));assert.equal(rows.length,1);const cells=rows[0].split('\t');assert.equal(cells.length,3);assert.ok(cells[0].includes(card.label));assert.ok(cells[1].includes(card.example.text));assert.match(cells[1],/https:\/\/jlpt.example\/practice\?/);assert.match(cells[1],/https:\/\/jlpt.example\/frequency\?/);assert.match(cells[2],/ref::N1/);
 const unsafe=exports.createAnkiText([{...card,meaning:'<script>alert(1)</script>\tfirst\nsecond',example:{...card.example,path:'//evil.example'}}],'https://jlpt.example');assert.equal(unsafe.includes('<script>'),false);assert.equal(unsafe.includes('evil.example'),false);assert.match(unsafe,/&lt;script&gt;/);assert.match(unsafe,/first<br>second/);assert.throws(()=>exports.createAnkiText([card],'javascript:alert(1)'));
});
test('plain word-list export is normalized, deduplicated, one word per line and never masquerades as a verified proprietary format',()=>{
 assert.equal(exports.createWordListText([card,card,{label:'ｺｰﾋｰ'},{label:'コーヒー'}]),'華々しい\nコーヒー\n');assert.equal(exports.createWordListText([{label:'x\ny\tz'}]),'x y z\n');
});
test('personal CSV preserves meanings, examples, stable/source links, commas and quotes, and blocks spreadsheet formulas',()=>{
  const text=exports.createTermCsv([card,card,{...card,label:'=HYPERLINK("bad")',reading:' +SUM(1,2)',meaning:'第一行, "引号"\n第二行',example:{...card.example,path:'//evil.example'}}],'https://jlpt.example');
  assert.ok(text.startsWith('\uFEFF"词条","读音"'));
  assert.equal((text.match(/"華々しい"/g)??[]).length,1);
  assert.ok(text.includes(card.example.text));assert.ok(text.includes('https://jlpt.example/practice?'));
  assert.ok(text.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(text.includes('"\' +SUM(1,2)"'));
  assert.ok(text.includes('"第一行, ""引号""\n第二行"'));assert.equal(text.includes('evil.example'),false);
  for(const locale of ['ja','en'])assert.equal(exports.createTermCsv([card],'https://jlpt.example',locale).split('\r\n').length,3);
});
