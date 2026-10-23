import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';
import sharp from 'sharp';
import kuromoji from 'kuromoji';
import {createImageTextIndex, withFrequencyImageText, questionImageReferences} from '../src/lib/frequency-image-text.mjs';
import {createFrequencyBuilder, defaultFrequencyFilters, queryFrequency} from '../src/lib/bank-frequency.mjs';
import {frequencyExamplePreview} from '../src/lib/frequency-evidence.mjs';
import {collectImageChecklist, importReviewedImageText, recognizeImage, ocrConfidence} from './ocr-bank-images.mjs';

const require = createRequire(import.meta.url);
const tokenizer = await new Promise((resolve,reject)=>kuromoji.builder({dicPath:path.dirname(require.resolve('kuromoji/dict/base.dat.gz'))}).build((error,result)=>error?reject(error):resolve(result)));
const image = (key,text,extra={}) => ({key,text,sha256:'a'.repeat(64),reviewed:true,...extra});
const question = (id,extra={}) => ({id,source:'imported',level:'N1',period:'202507',category:'阅读',instruction:'問題13',prompt:'',options:[],explanation:[],media:{images:['pic/1.jpg']},...extra});
function build(questions,images){const builder=createFrequencyBuilder(text=>tokenizer.tokenize(text)),index=createImageTextIndex({version:1,images}); for(const q of questions)builder.addQuestion(withFrequencyImageText(q,index));return builder.finish('image-test');}
const find = (corpus,label,filters={})=>queryFrequency(corpus,{...defaultFrequencyFilters,...filters,size:100}).rows.find(row=>row.label===label);

test('only reviewed Japanese text with a valid image key and checksum can enter the corpus',()=>{
  assert.equal(createImageTextIndex({version:1,images:[image('pic/1.jpg','学生です。',{reviewed:false})]}).size,0);
  for(const value of [image('../1.jpg','学生です。'),image('pic/1.jpg','学生です。',{sha256:''}),image('pic/1.jpg','<script>学生</script>'),image('pic/1.jpg',''),image('pic/1.jpg','1234')])assert.throws(()=>createImageTextIndex({version:1,images:[value]}));
  assert.throws(()=>createImageTextIndex({version:1,images:[image('pic/1.jpg','学生です。'),image('pic/1.jpg','学生です。')]}));
});

test('shared images count once per paper while retaining every subquestion and full filter coverage',()=>{
  const source=[question('a'),question('b'),question('c',{period:'202512'})],snapshot=JSON.stringify(source);
  const corpus=build(source,[image('pic/1.jpg','学生は本を読みます。')]);
  const row=find(corpus,'学生');assert.equal(row.occurrences,2);assert.equal(row.questions,3);assert.equal(row.papers,2);
  assert.equal(find(corpus,'学生',{period:'202507',field:'passage'}).occurrences,1);
  assert.equal(find(corpus,'学生',{field:'prompt'}),undefined);
  assert.equal(JSON.stringify(source),snapshot);
});

test('own question pictures use the prompt field, duplicate references are removed, and different images remain separate',()=>{
  const q=question('a',{media:{images:['pic/1.jpg'],questionImages:['pic/2.jpg','pic/2.jpg','pic/../invalid.jpg']}});
  assert.equal(questionImageReferences(q).length,2);
  const corpus=build([q],[image('pic/1.jpg','学生は本を読みます。'),image('pic/2.jpg','学生は公園に行きます。')]);
  assert.equal(find(corpus,'学生').occurrences,2);assert.equal(find(corpus,'学生',{field:'prompt'}).occurrences,1);
  assert.equal(find(corpus,'公園',{field:'passage'}),undefined);
  const separate=build([question('a',{media:{images:['pic/1.jpg','pic/2.jpg']}})],[image('pic/1.jpg','学生です。'),image('pic/2.jpg','学生です。')]);
  assert.equal(find(separate,'学生').occurrences,2);
});

test('existing transcriptions are not counted twice and image-only evidence highlights the original OCR text',()=>{
  const q=question('a',{passage:'学生は本を読みます。'}),entry=image('pic/1.jpg','学生は本を読みます。\n公園で遊びます。');
  const corpus=build([q],[entry]);assert.equal(find(corpus,'学生').occurrences,1);assert.equal(find(corpus,'公園').occurrences,1);
  const enriched=withFrequencyImageText(q,createImageTextIndex({version:1,images:[entry]}));
  const preview=frequencyExamplePreview(enriched,['passage'],['公園']);assert.equal(preview.excerpts.length,1);assert.equal(preview.excerpts[0].text,'公園で遊びます。');assert.equal(preview.excerpts[0].field,'passage');
  assert.equal(frequencyExamplePreview(enriched,['options'],['公園']).excerpts.length,0);
});

test('review import merges idempotently and invalid text cannot overwrite reviewed entries',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jlpt-image-review-'));
  try{const output=path.join(dir,'entries.json'),data={version:1,images:[image('pic/1.jpg','学生です。')]};
    assert.equal((await importReviewedImageText(data,output)).total,1);const before=await fs.readFile(output,'utf8');
    await importReviewedImageText(data,output);assert.equal(await fs.readFile(output,'utf8'),before);
    await assert.rejects(importReviewedImageText({version:1,images:[image('pic/1.jpg','',{reviewed:false})]},output));
    assert.equal(await fs.readFile(output,'utf8'),before);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('the checklist includes all unique bank images, links shared children and keeps own pictures separate',async()=>{
  const checklist=await collectImageChecklist();assert.equal(checklist.images.length,158);
  const shared=checklist.images.find(i=>i.uploadPath==='pic/120250765.jpg'),own=checklist.images.find(i=>i.uploadPath==='pic/120250765-1.jpg');
  assert.equal(shared.questions.length,2);assert.equal(own.questions.length,1);assert.equal(shared.questions[0].field,'passage');assert.equal(own.questions[0].field,'prompt');
  assert.ok(checklist.images.some(i=>i.questions.some(q=>q.id.includes(':4:'))));
});

test('confidence uses actual OCR words rather than page and block placeholder rows',()=>{
  assert.equal(ocrConfidence('header\n1\t0\t0\t0\t0\t0\t0\t0\t1\t1\t-1\t\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t80\t学校\n5\t1\t1\t1\t1\t2\t0\t0\t1\t1\t100\t本'),86.67);
});

test('the installed Japanese OCR engine recognizes an actual rendered image', {skip:!process.env.OCR_TESSDATA_DIR && 'Set OCR_TESSDATA_DIR to run the native OCR integration test'}, async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jlpt-native-ocr-'));
  try{const filename=path.join(dir,'sample.png');
    await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360"><rect width="1200" height="360" fill="white"/><g font-family="Noto Sans CJK JP" font-size="56" fill="black"><text x="40" y="90">図書館の利用案内</text><text x="40" y="190">学生は本を読みます。</text><text x="40" y="290">公園で勉強します。</text></g></svg>')).png().toFile(filename);
    const result=await recognizeImage(filename,{tessdataDirectory:process.env.OCR_TESSDATA_DIR,cacheDirectory:path.join(dir,'work')});
    assert.match(result.text.replace(/\s/g,''),/図書館/);assert.match(result.text.replace(/\s/g,''),/学生/);assert.ok(result.confidence>40);assert.equal(result.reviewed,false);assert.match(result.sha256,/^[a-f0-9]{64}$/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
