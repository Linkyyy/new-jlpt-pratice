import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {frequencyExcerpt,frequencyExamplePreview} from '../src/lib/frequency-evidence.mjs';
import {annotateFrequencyAudit} from '../src/lib/frequency-audit.mjs';
import {annotateFrequencyLevels} from '../src/lib/frequency-levels.mjs';
import {annotateFrequencyCorpus} from '../src/lib/frequency-definitions.mjs';

test('excerpts center long source text on actual headword/alias/inflected matches with safe plain-text offsets',()=>{
  const long='前文です。'.repeat(90)+'昨日、本を読みました。後文です。';
  const excerpt=frequencyExcerpt(long,['読む','読み']);assert.ok(excerpt.text.includes('読みました'));assert.ok(excerpt.text.length<=242);assert.ok(excerpt.matches.length);assert.equal(excerpt.text.slice(excerpt.matches[0].start,excerpt.matches[0].end),'読み');
  assert.equal(frequencyExcerpt('別の文章です。',['存在しない']),null);
  const html=frequencyExcerpt('<script>alert(1)</script><p>華々しい</p>',['華々しい']);assert.equal(html.text,'華々しい');assert.equal(html.matches[0].start,0);
  const overlap=frequencyExcerpt('華々しい、はなばなしい。',['華々','華々しい','はなばなしい']);assert.equal(overlap.matches.length,2);assert.equal(overlap.text.slice(overlap.matches[0].start,overlap.matches[0].end),'華々しい');
});
test('source fields and option numbers are exact, and no example or translation is fabricated',()=>{
  const question={prompt:'正しい答えを選んでください。',passage:'この文は対象外です。',options:[{text:'別の選択肢'},{text:'華々しい活躍でした。'}],explanation:[]};
  const preview=frequencyExamplePreview(question,['options'],['華々しい']);assert.equal(preview.excerpts.length,1);assert.equal(preview.excerpts[0].field,'options');assert.equal(preview.excerpts[0].option,2);assert.ok(preview.excerpts[0].text.includes('活躍'));
  assert.equal(frequencyExamplePreview(question,['passage'],['華々しい']).excerpts.length,0);
});
test('review flags do not delete legitimate unknown words or invent grades; homonymous noun よく cannot inherit the adverb grade',()=>{
  const c={terms:[['よく','よく','名词','word'],['未知語','みちご','名词','word']],definitions:[{meaning:'欲望',source:'wiktionary'},{meaning:'',source:'missing'}],units:[['prompt',[0],[0,1,1,1]]],questions:[['q','imported','N1','202412','vocabulary','x',1,true,0]],referenceBasis:['ungraded','ungraded']};
  annotateFrequencyLevels(c,[['よく','よく','N5']],{name:'test'});assert.deepEqual(c.referenceLevels,[[],[]]);const result=annotateFrequencyAudit(c,{});assert.equal(result.total,2);assert.equal(result.ungraded,2);assert.ok(c.termReview[1].flags.includes('token'));assert.equal(c.terms.length,2);
});
test('POS-specific homophone corrections and multiple possible kanji senses are explicit',()=>{
  const c={terms:[['いくら','いくら','副词','word'],['かなり','かなり','名词','word'],['かく','かく','动词','word']]};
  annotateFrequencyCorpus(c,{'いくら':[{word:'イクラ',readings:['いくら'],pos:'unknown',glosses:['鱼子']}],'かなり':[{word:'金成',readings:['かなり'],pos:'name',glosses:['姓氏']}],'かく':[{word:'書く',readings:['かく'],pos:'verb',glosses:['写']},{word:'欠く',readings:['かく'],pos:'verb',glosses:['缺乏']}]});
  assert.equal(c.definitions[0].meaning.includes('鱼子'),false);assert.equal(c.definitions[1].meaning.includes('姓氏'),false);assert.deepEqual(c.definitions[2].senses.map(s=>s.word),['書く','欠く']);
});
test('production provenance, source forms and audit rows stay aligned after filtering and spelling/POS merging',()=>{
  const c=JSON.parse(gunzipSync(fs.readFileSync(new URL('../src/data/bank-frequency/corpus.json.gz',import.meta.url))));
  for(const key of ['surfaceForms','termReview','referenceEvidence'])assert.equal(c[key].length,c.terms.length,key);
  const reading=c.terms.findIndex(t=>t[0]==='読む');assert.ok(c.surfaceForms[reading].includes('読み'));
  assert.ok(c.referenceEvidence.some(rows=>rows.some(source=>source.name&&source.url&&source.levels.length)));
  const metadata=JSON.parse(fs.readFileSync(new URL('../src/data/bank-frequency/manifest.json',import.meta.url)));
  assert.ok(c.auditSummary.token>0);assert.equal(c.questions.length,metadata.summary.questions);
});
