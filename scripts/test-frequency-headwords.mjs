import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import {preferFrequencyHeadwords, frequencySourceHeadwords} from '../src/lib/frequency-headwords.mjs';
import {mergeFrequencyDuplicateWords} from '../src/lib/frequency-duplicates.mjs';
import {annotateFrequencyLevels} from '../src/lib/frequency-levels.mjs';
import {annotateFrequencySupplements} from '../src/lib/frequency-review.mjs';
import {defaultFrequencyFilters, queryFrequency} from '../src/lib/bank-frequency.mjs';

const require=createRequire(import.meta.url);
const reviewed=JSON.parse(fs.readFileSync(new URL('../src/data/frequency-levels/preferred-headwords.json',import.meta.url))).entries;
const query=(c,q)=>queryFrequency(c,{...defaultFrequencyFilters,q});
const semanticResolver=()=>{
  const exports={},source=fs.readFileSync(new URL('../src/lib/bank-frequency.server.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>name.startsWith('@/')?{}:require(name)});
  return exports.findFrequencyTerm;
};

test('reviewed kanji headwords work without a preexisting kanji row, preserving kana aliases and exact POS/reading guards',()=>{
  const c={terms:[['あきらめる','あきらめる','动词','word'],['ジム','じむ','名词','word'],['しっかり','しっかり','副词','word'],['あきらめる','あきらめる','名词','word'],['あきらめる','ちがう','动词','word'],['あきらめる','あきらめる','语法表达','grammar']]};
  const report=preferFrequencyHeadwords(c,reviewed);
  assert.equal(report.changedHeadwords,1);assert.equal(c.terms[0][0],'諦める');assert.deepEqual(c.aliases[0],['あきらめる']);
  assert.deepEqual(frequencySourceHeadwords(c,0),['あきらめる']);assert.equal(c.terms[1][0],'ジム');assert.equal(c.terms[2][0],'しっかり');
  assert.equal(c.terms[3][0],'あきらめる');assert.equal(c.terms[4][0],'あきらめる');assert.equal(c.terms[5][0],'あきらめる');
  assert.equal(preferFrequencyHeadwords(c,reviewed).changedHeadwords,0);
});

test('a display spelling cannot introduce a spelling-specific grade absent from the actual original headword',()=>{
  const c={terms:[['あきらめる','あきらめる','动词','word']]};
  preferFrequencyHeadwords(c,reviewed);
  annotateFrequencyLevels(c,[['諦める','あきらめる','N1']],{name:'primary'});
  assert.deepEqual(c.referenceLevels,[[]]);
  annotateFrequencySupplements(c,[{kind:'word',label:'あきらめる',reading:'あきらめる',levels:['N3'],method:'word-list'}],[],{name:'supplement'});
  assert.deepEqual(c.referenceLevels,[['N3']]);assert.deepEqual(c.referenceBasis,['supplemental']);
});

test('joining a kana row to an existing kanji row preserves both published grades, counts, senses and old saved identities',()=>{
  const c={version:1,revision:'fixture',terms:[['そろえる','そろえる','动词','word'],['揃える','そろえる','动词','word']],
    definitions:[{meaning:'使一致',usage:'',source:'editorial'},{meaning:'备齐',usage:'',source:'wiktionary'}],
    aliases:[['ソロエル'],[]],units:[['prompt',[0,1],[0,2,1,3]]],
    questions:[['a','imported','N1','202412','reading','test',1,true,0],['b','imported','N1','202412','reading','test',2,true,0]],papers:[['imported','N1','202412']],summary:{terms:2},subtypes:[]};
  const before=JSON.stringify(c.questions),references=JSON.stringify(c.units.map(unit=>unit.slice(0,2)));
  preferFrequencyHeadwords(c,reviewed);mergeFrequencyDuplicateWords(c);
  annotateFrequencyLevels(c,[['揃える','そろえる','N2']],{name:'primary'});
  annotateFrequencySupplements(c,[{kind:'word',label:'そろえる',reading:'そろえる',levels:['N3'],method:'word-list'}],[],{name:'supplement'});
  assert.deepEqual(c.referenceLevels,[['N2','N3']]);assert.equal(c.referenceEvidence[0].length,2);
  assert.match(c.definitions[0].meaning,/使一致/);assert.match(c.definitions[0].meaning,/备齐/);
  for(const label of ['そろえる','揃える','ソロエル']){
    const result=query(c,label);assert.equal(result.total,1);assert.equal(result.rows[0].occurrences,5);assert.equal(result.rows[0].questions,2);
    assert.equal(semanticResolver()(c,{kind:'word',label,reading:'そろえる',pos:'动词'}),0);
  }
  assert.equal(JSON.stringify(c.questions),before);assert.equal(JSON.stringify(c.units.map(unit=>unit.slice(0,2))),references);
});

test('the rebuilt corpus contains every reviewed kanji preference and keeps all prior kana entry points searchable',()=>{
  const c=JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz',import.meta.url))));
  const quality=JSON.parse(fs.readFileSync(new URL('../src/data/bank-frequency/quality-report.json',import.meta.url)));
  assert.equal(quality.headwords.changedHeadwords,reviewed.length);assert.ok(quality.headwords.changedHeadwords>300);
  const find=semanticResolver();
  for(const change of quality.headwords.changes){
    for(const pos of change.partsOfSpeech){
      const id=find(c,{kind:'word',label:change.prior,reading:change.reading,pos});
      assert.ok(id>=0,`${change.prior}/${pos}`);assert.equal(c.terms[id][0],change.label);
      assert.ok(c.aliases[id].includes(change.prior));assert.ok(frequencySourceHeadwords(c,id).includes(change.prior));
    }
  }
  for(const label of ['しっかり','きっかけ','ジム','テンポ','リネン']) assert.ok(c.terms.some(term=>term[0]===label),label);
  for(const [label,canonical] of [['あきらめる','諦める'],['さまざま','様々'],['まんが','漫画'],['こころ','心']]){
    const result=query(c,label);assert.ok(result.rows.some(row=>row.label===canonical),label);
  }
  const katakana=queryFrequency(c,{...defaultFrequencyFilters,q:'イス',pos:'片假名词'});
  assert.ok(katakana.rows.some(row=>row.label==='椅子'));
  assert.equal(c.sourceHeadwords.length,c.terms.length);assert.equal(c.questions.length,8759);
});
