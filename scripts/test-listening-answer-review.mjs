import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {listeningAnswerSourceHash,withReviewedListeningAnswer} from '../src/lib/listening-answer-review.mjs';
import {listeningTranscript} from '../src/lib/bank-frequency.mjs';
import {applyListeningAnswers} from './apply-listening-answers.mjs';
import {importListeningPractice} from './import-listening-practice.mjs';

const root=new URL('../',import.meta.url);
const read=async name=>JSON.parse(await fs.readFile(new URL(name,root),'utf8'));
function fixture(){
  const source={id:'q',sourceIdentity:'identity',sourceParentId:'parent',options:[{id:'A',label:'1',text:'読む'},{id:'B',label:'2',text:'書く'}],explanation:['<p>听力原文</p><p>今日は先に資料を読みます。</p>']};
  const question={...source,category:'听力',correctOptionId:null};
  const review={id:'q',sourceHash:listeningAnswerSourceHash(source),status:'confirmed',correctOptionId:'A',firstPassOptionId:'A',secondPassOptionId:'A',rationale:'先读资料。',evidence:['先に資料を読みます']};
  return {source,question,review};
}

test('two matching readings with literal evidence fill an inferred key without changing transcript statistics',()=>{
  const {source,question,review}=fixture(),before=JSON.stringify(question);
  const updated=withReviewedListeningAnswer(question,source,review);
  assert.equal(updated.correctOptionId,'A');assert.match(updated.explanation[0],/推导参考答案（非官方）/);
  assert.equal(listeningTranscript(updated.explanation),listeningTranscript(source.explanation));
  assert.equal(JSON.stringify(question),before);
  assert.deepEqual(withReviewedListeningAnswer(updated,source,review),updated);
});

test('changed sources, conflicting passes, invalid choices and fabricated evidence cannot be applied',()=>{
  const {source,question,review}=fixture();
  for(const patch of [{sourceHash:'0'.repeat(64)},{secondPassOptionId:'B'},{firstPassOptionId:'B'},
    {correctOptionId:'D',firstPassOptionId:'D',secondPassOptionId:'D'},{evidence:['原文中没有这个句子']},{evidence:[]}]){
    assert.throws(()=>withReviewedListeningAnswer(question,source,{...review,...patch}));
  }
  assert.throws(()=>withReviewedListeningAnswer(question,{...source,options:[...source.options].reverse()},review),/source changed/);
  assert.equal(withReviewedListeningAnswer(question,source,{...review,status:'needs-image',secondPassOptionId:null}),question);
});

test('all 231 published inferences match reviewed sources and five unresolved questions remain ungraded',async()=>{
  const registry=await read('src/data/listening-answer-review/entries.json');
  assert.equal(registry.entries.length,236);assert.equal(registry.official,false);
  let confirmed=0,pending=0;
  for(const paper of [...new Set(registry.entries.map(row=>`${row.period}-${row.level}`))]){
    const source=await read(`src/data/frequency-listening/exams/${paper}.json`),bank=await read(`src/data/imported-bank/questions/${paper}-4.json`);
    const sources=new Map(source.questions.map(q=>[q.id,q])),metadata=new Map(bank.sourceMetadata.questions.map(q=>[q.id,q]));
    for(const q of bank.questions){
      const row=registry.entries.find(row=>row.id===q.id);assert(row);
      assert.equal(row.sourceHash,listeningAnswerSourceHash(sources.get(q.id)));
      if(row.status==='confirmed'){
        assert.equal(q.correctOptionId,row.correctOptionId);assert.equal(row.firstPassOptionId,row.secondPassOptionId);
        assert.equal(metadata.get(q.id).answerStatus,'inferred-reviewed');
        assert.deepEqual(withReviewedListeningAnswer(q,sources.get(q.id),row),q);confirmed++;
      }else{assert.equal(q.correctOptionId,null);pending++;}
    }
  }
  assert.equal(confirmed,231);assert.equal(pending,5);
  assert.equal(registry.entries.filter(row=>row.status==='needs-image').length,4);
  const ambiguous=registry.entries.find(row=>row.period==='202507'&&row.level==='N1'&&row.questionNumber===88);
  assert.equal(ambiguous.firstPassOptionId,'A');assert.equal(ambiguous.secondPassOptionId,null);
});

test('reimport and repeat application preserve inferred provenance, analysis and stable bank contents',async()=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'jlpt-reviewed-answers-'));
  try{
    await fs.mkdir(path.join(temporary,'questions'));
    const manifest=await read('src/data/imported-bank/index.json'),registry=await read('src/data/listening-answer-review/entries.json');
    const files=new Set(registry.entries.map(row=>`${row.period}-${row.level}-4.json`));
    const groups=manifest.groups.filter(group=>files.has(group.file)),before=new Map();
    for(const group of groups){const bytes=await fs.readFile(new URL(`src/data/imported-bank/questions/${group.file}`,root),'utf8');before.set(group.file,bytes);await fs.writeFile(path.join(temporary,'questions',group.file),bytes);}
    await fs.writeFile(path.join(temporary,'index.json'),JSON.stringify({...manifest,groups}));
    const options={bankDirectory:temporary,sourceDirectory:new URL('src/data/frequency-listening/',root).pathname};
    await importListeningPractice({outputDirectory:temporary,sourceDirectory:options.sourceDirectory});
    for(const [file,bytes]of before)assert.equal(await fs.readFile(path.join(temporary,'questions',file),'utf8'),bytes);
    const report=await applyListeningAnswers(options);assert.equal(report.filledNow,0);assert.equal(report.confirmed,231);
    for(const [file,bytes]of before)assert.equal(await fs.readFile(path.join(temporary,'questions',file),'utf8'),bytes);
    const invalid=structuredClone(registry);invalid.entries.find(row=>row.status==='confirmed').sourceHash='a'.repeat(64);
    const reviewFile=path.join(temporary,'bad-review.json');await fs.writeFile(reviewFile,JSON.stringify(invalid));
    await assert.rejects(applyListeningAnswers({...options,reviewFile}),/source changed/);
    for(const [file,bytes]of before)assert.equal(await fs.readFile(path.join(temporary,'questions',file),'utf8'),bytes);
    const changedSource=path.join(temporary,'changed-source');
    await fs.cp(options.sourceDirectory,changedSource,{recursive:true});
    const first=registry.entries.find(row=>row.status==='confirmed');
    const sourceFile=path.join(changedSource,'exams',`${first.period}-${first.level}.json`);
    const updated=JSON.parse(await fs.readFile(sourceFile,'utf8'));
    updated.questions.find(q=>q.id===first.id).explanation.push('<p>訂正後の原文です。</p>');
    await fs.writeFile(sourceFile,JSON.stringify(updated));
    await importListeningPractice({outputDirectory:temporary,sourceDirectory:changedSource});
    const changedBank=JSON.parse(await fs.readFile(path.join(temporary,'questions',`${first.period}-${first.level}-4.json`),'utf8'));
    const changedQuestion=changedBank.questions.find(q=>q.id===first.id);
    assert.equal(changedQuestion.correctOptionId,null);
    assert.equal(changedBank.sourceMetadata.questions.find(q=>q.id===first.id).answerStatus,'pending');
    assert.deepEqual(changedQuestion.explanation,updated.questions.find(q=>q.id===first.id).explanation);
    assert.equal(changedBank.questions.filter(q=>q.correctOptionId!==null).length,JSON.parse(before.get(`${first.period}-${first.level}-4.json`)).questions.filter(q=>q.correctOptionId!==null).length-1);
  }finally{await fs.rm(temporary,{recursive:true,force:true});}
});
