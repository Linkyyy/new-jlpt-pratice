import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';
import {createTermStudyPdf} from '../src/lib/term-study-pdf.mjs';

const require=createRequire(import.meta.url),now=Date.now();
const card={kind:'word',label:'華々しい',reading:'はなばなしい',pos:'形容词',meaning:'华丽；壮烈',usage:'用于表现或活动',referenceLevels:['N1'],example:{text:'華々しい活躍でした。',path:'/practice?question=sample&source=imported',label:'N1 · 202412 · 1'}};
const entry={...card,key:JSON.stringify([card.kind,card.label,card.reading,card.pos]),savedAt:now,updatedAt:now,reviewedAt:null,reviews:0,status:'pending'};
const compile=file=>ts.transpileModule(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function routeEnvironment(env={}){
  const modules={},seen=[];
  function load(name){if(modules[name])return modules[name];const exports={};modules[name]=exports;vm.runInNewContext(compile('lib/'+name+'.ts'),{exports,Buffer,URL,Response,Date,process:{env},require:dep=>dep.startsWith('./')?load(dep.slice(2)):require(dep)});return exports;}
  const api={};
  vm.runInNewContext(compile('app/api/frequency/export/route.ts'),{exports:api,Buffer,URL,URLSearchParams,Response,Uint8Array,process:{env},require:dep=>{
    if(dep==='@/lib/frequency-access.server')return {checkFrequencyAccess:()=>null};
    if(dep==='@/lib/term-study-pdf.mjs')return {createTermStudyPdf:async cards=>{seen.push(cards);return Buffer.from('%PDF-selected\n%%EOF');}};
    if(['@/lib/request-limits','@/lib/request-security','@/lib/term-study-data'].includes(dep))return load(dep.slice(6));
    return {};
  }});
  return {api,seen};
}
const request=(body,headers={})=>new Request('https://jlpt.example/api/frequency/export?format=pdf&locale=zh',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});

test('personal PDF prints the exact selected terms with CJK meanings/examples and stable/source links, without frequency statistics',async()=>{
  const bytes=await createTermStudyPdf([card],'https://jlpt.example','zh',new Date('2026-10-22T00:00:00Z'));
  assert.match(bytes.toString('latin1'),/^%PDF/);assert.match(bytes.toString('latin1'),/%%EOF\s*$/);
  assert.match(bytes.toString('latin1'),/https:\/\/jlpt.example\/practice\?question=sample/);assert.match(bytes.toString('latin1'),/https:\/\/jlpt.example\/frequency\?/);
  const extracted=spawnSync('pdftotext',['-','-'],{input:bytes});
  if(!extracted.error){assert.equal(extracted.status,0);const text=extracted.stdout.toString().replace(/\s/g,'');for(const value of [card.label,card.reading,card.meaning,card.example.text])assert.ok(text.includes(value));assert.equal(text.includes('出现次数'),false);}
  await assert.rejects(()=>createTermStudyPdf([],'https://jlpt.example'));
  await assert.rejects(()=>createTermStudyPdf([card],'javascript:bad'));
});
test('long personal PDF entries span pages without dropping the final card',async()=>{
  const bytes=await createTermStudyPdf([{...card,meaning:'長い説明。'.repeat(400),usage:'接续说明。'.repeat(400)},{...card,label:'最終カード'}],'https://jlpt.example','ja');
  assert.match(bytes.toString('latin1'),/\/Type \/Pages[\s\S]*\/Count [2-9]/);
  const extracted=spawnSync('pdftotext',['-','-'],{input:bytes});if(!extracted.error)assert.ok(extracted.stdout.toString().replace(/\s/g,'').includes('最終カード'));
});
test('personal export validates streamed bytes and term identities, keeps exact selection and reuses export limits',async()=>{
  const e=routeEnvironment();
  const valid={version:1,entries:[entry]};
  const response=await e.api.POST(request(valid));assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(e.seen.length,1);assert.equal(e.seen[0].length,1);assert.equal(e.seen[0][0].label,card.label);
  assert.equal((await e.api.POST(request({...valid,entries:[{...entry,key:'tampered'}]}))).status,400);
  assert.equal((await e.api.POST(request({...valid,entries:[]}))).status,400);
  assert.equal((await e.api.POST(request('{broken'))).status,400);
  assert.equal((await e.api.POST(request(' '.repeat(1024*1024+1)))).status,413);
  assert.equal(e.seen.length,1);
  assert.equal((await e.api.POST(request(valid))).status,200);
  assert.equal((await e.api.POST(request(valid))).status,429);
  assert.equal((await routeEnvironment().api.POST(request(valid,{origin:'https://evil.example'}))).status,403);
  assert.equal((await routeEnvironment({FREQUENCY_EXPORT_ENABLED:'false'}).api.POST(request(valid))).status,503);
});
