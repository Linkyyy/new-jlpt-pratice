import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {convertListeningPractice,importListeningPractice} from './import-listening-practice.mjs';

const require=createRequire(import.meta.url);
async function loadTs(filename){
  const source=await fs.readFile(new URL(`../${filename}`,import.meta.url),'utf8'),exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>name==='@/lib/i18n'?{useI18n:()=>({t:(text,params={})=>text.replace(/\{(\w+)\}/g,(match,key)=>String(params[key]??match))})}:name==='@/components/rich-content'?{default:({text})=>React.createElement('p',null,text)}:
      name==='@/data/practice-question'?{optionLabel:(question,id)=>question.options.find(o=>o.id===id)?.label??'未作答'}:require(name)});
  return exports;
}

test('feedback and score UI show pending answer keys without red wrong-answer states or a fabricated zero score',async()=>{
  const question=convertListeningPractice(fixture()).questions[0];
  const component=await loadTs('src/app/practice/question-answer.tsx');
  const html=renderToStaticMarkup(React.createElement(component.default,{question,selectedOptionId:'B',locked:true,revealAnswer:true,onSelect(){}}));
  assert.match(html,/参考答案待补充/);assert.doesNotMatch(html,/回答错误|回答正确|bg-rose-50/);
  const scoring=await loadTs('src/lib/practice-scoring.ts'),report=await loadTs('src/components/score-report.tsx');
  const result=scoring.calculatePracticeScore({level:'N1',questions:[question]},{[question.id]:'B'});
  const summary=renderToStaticMarkup(React.createElement(report.default,{result}));
  assert.match(summary,/参考答案待补充/);assert.doesNotMatch(summary,/得分 0\/60/);
});

function fixture(){
  return {period:'202507',level:'N1',sourceFile:'source.json',checksum:'source-hash',questionCount:3,
    questions:[67,68,69].map((number,index)=>({id:`imported:202507:N1:4:${100+index}:${number}`,level:'N1',category:'听力',
      sourceObjectId:`question-${index}`,sourceParentId:index<2?'shared-parent':'next-parent',sourceIdentity:`source-${index}`,
      sourceQuestionNumber:number,instruction:'問題1 用紙の1から4',prompt:'',options:['A','B','C','D'].map((id,i)=>({id,label:String(i+1),text:String(i+1)})),explanation:['<p>听力原文</p>これは共有の音声です。']}))};
}

test('filename convention numbers parent recordings once and preserves source question IDs and missing answers',()=>{
  const source=fixture(),bank=convertListeningPractice(source);
  assert.deepEqual(bank.questions.map(q=>q.media.audio),['audio/202507n1/1.mp3','audio/202507n1/1.mp3','audio/202507n1/2.mp3']);
  assert.deepEqual(bank.questions.map(q=>q.id),source.questions.map(q=>q.id));
  assert.ok(bank.questions.every(q=>q.correctOptionId===null));
  assert.deepEqual(bank.questions[0].media.images,['pic/120250767.jpg']);
  assert.equal(bank.unavailable.length,0);
});

test('source audio and answer keys take priority; blank spoken options remain selectable without unnecessary images',()=>{
  const source=fixture();source.questions[0].media={audio:'audio/202507n1/original.mp3',images:[]};source.questions[0].correctOptionId='C';
  source.questions[1].instruction='問題4 用紙に何も印刷されていません。';source.questions[1].options.forEach(q=>q.text='<br>');
  const bank=convertListeningPractice(source);
  assert.equal(bank.questions[0].correctOptionId,'C');assert.equal(bank.questions[0].media.audio,'audio/202507n1/original.mp3');
  assert.deepEqual(bank.questions[1].media.images,[]);
  assert.ok(bank.questions[1].options.every(option=>option.text.includes('以音频为准')));
  source.questions[0].media.audio='audio/../bad.mp3';assert.throws(()=>convertListeningPractice(source),/audio path/);
});

test('illustrated N3 speech-response questions keep their picture path even when all three options are blank HTML',()=>{
  const source=fixture();source.questions[0].instruction='問題4 では、えを見ながら質問を聞いてください。';
  source.questions[0].options=source.questions[0].options.slice(0,3).map(option=>({...option,text:'<br>'}));
  const question=convertListeningPractice(source).questions[0];
  assert.deepEqual(question.media.images,['pic/120250767.jpg']);assert.equal(question.options.length,3);
});

test('all eight real exams expose 236 playable questions and 230 recording paths with six shared final recordings',async()=>{
  const drawer=await loadTs('src/app/practice/article-questions.ts');
  const directory=new URL('../src/data/frequency-listening/',import.meta.url);
  const index=JSON.parse(await fs.readFile(new URL('index.json',directory),'utf8'));
  let count=0,recordings=0,shared=0;
  for(const group of index.groups){
    const source=JSON.parse(await fs.readFile(new URL(`exams/${group.file}`,directory),'utf8'));
    const bank=JSON.parse(await fs.readFile(new URL(`../src/data/imported-bank/questions/${group.period}-${group.level}-4.json`,import.meta.url),'utf8'));
    assert.equal(bank.questions.length,source.questionCount);assert.equal(bank.unavailable.length,0);
    const paths=new Map();
    for(const q of bank.questions){const audio=q.media.audio;paths.set(audio,(paths.get(audio)??0)+1);assert(q.prompt.length);assert(q.options.every(o=>o.text.replace(/<[^>]*>/g,'').trim()));}
    const ids=new Set(source.questions.map(q=>q.id));assert.ok(bank.questions.every(q=>ids.has(q.id)));
    if(group.level!=='N3'){
      assert.equal(bank.questions.at(-1).media.audio,bank.questions.at(-2).media.audio);assert(bank.questions.at(-1).media.audio.endsWith('/29.mp3'));
      assert.equal(drawer.usesArticleDrawer(bank.questions.at(-1),bank.questions),true);
      assert.equal(drawer.articleGroup(bank.questions,bank.questions.at(-1)).length,2);
    }
    count+=bank.questions.length;recordings+=paths.size;shared+=[...paths.values()].filter(n=>n===2).length;
  }
  assert.equal(count,236);assert.equal(recordings,230);assert.equal(shared,6);
});

test('reimports are idempotent and preserve subsequently supplied reference answer keys',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'jlpt-listening-practice-'));
  try{
    const sourceDirectory=path.join(temp,'source'),outputDirectory=path.join(temp,'bank');
    await fs.mkdir(path.join(sourceDirectory,'exams'),{recursive:true});await fs.mkdir(path.join(outputDirectory,'questions'),{recursive:true});
    await fs.writeFile(path.join(sourceDirectory,'index.json'),JSON.stringify({groups:[{file:'202507-N1.json',period:'202507',level:'N1'}]}));
    await fs.writeFile(path.join(sourceDirectory,'exams/202507-N1.json'),JSON.stringify(fixture()));
    await fs.writeFile(path.join(outputDirectory,'index.json'),JSON.stringify({groups:[],report:{sourceRecords:0,containers:0}}));
    const first=await importListeningPractice({sourceDirectory,outputDirectory});assert.equal(first.questions,3);
    const filename=path.join(outputDirectory,'questions/202507-N1-4.json');
    const before=await fs.readFile(filename,'utf8'),manifest=await fs.readFile(path.join(outputDirectory,'index.json'),'utf8');
    await importListeningPractice({sourceDirectory,outputDirectory});assert.equal(await fs.readFile(filename,'utf8'),before);assert.equal(await fs.readFile(path.join(outputDirectory,'index.json'),'utf8'),manifest);
    const bank=JSON.parse(before);bank.questions[0].correctOptionId='B';await fs.writeFile(filename,JSON.stringify(bank));
    const result=await importListeningPractice({sourceDirectory,outputDirectory});assert.equal(result.pendingAnswers,2);
    assert.equal(JSON.parse(await fs.readFile(filename,'utf8')).questions[0].correctOptionId,'B');
    const updated=fixture();updated.questions[0].correctOptionId='D';await fs.writeFile(path.join(sourceDirectory,'exams/202507-N1.json'),JSON.stringify(updated));
    await importListeningPractice({sourceDirectory,outputDirectory});assert.equal(JSON.parse(await fs.readFile(filename,'utf8')).questions[0].correctOptionId,'D');
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
