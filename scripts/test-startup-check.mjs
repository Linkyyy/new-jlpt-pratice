import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function fixture({storageDenied=false,bodyReady=true}={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/startup-check.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports});
  const events=new Map(),documentEvents=new Map(),panel={hidden:true};let stored=null,timeout,cleared=false;
  const window={location:{href:'https://jlpt.example/',origin:'https://jlpt.example'},
    sessionStorage:{setItem:(key,value)=>{assert.equal(key,'jlpt-practice.startup-check.v1');if(storageDenied)throw Error('Denied');stored=JSON.parse(value);}},
    setTimeout:(fn,milliseconds)=>{assert.equal(milliseconds,15000);timeout=fn;return 1;},clearTimeout:()=>{cleared=true;},
    addEventListener:(name,fn)=>events.set(name,fn)};
  const document={getElementById:()=>bodyReady?panel:null,addEventListener:(name,fn)=>documentEvents.set(name,fn)};
  vm.runInNewContext(exports.startupBootScript,{window,document,URL,Date});
  return {panel,events,documentEvents,runTimeout:()=>timeout(),ready:()=>events.get('jlpt:startup-ready')(),record:()=>stored,cleared:()=>cleared,setBodyReady:()=>{bodyReady=true;}};
}

test('stalled startup exposes recovery independently of React and successful startup hides it',()=>{
  const f=fixture();assert.equal(f.record().status,'starting');assert.equal(f.panel.hidden,true);
  f.runTimeout();assert.equal(f.record().status,'timeout');assert.equal(f.panel.hidden,false);
  f.ready();assert.equal(f.record().status,'ready');assert.equal(f.panel.hidden,true);assert.equal(f.cleared(),true);
  f.runTimeout();assert.equal(f.record().status,'ready');
});

test('denied browser storage never prevents a loading-failure message',()=>{
  const f=fixture({storageDenied:true});assert.doesNotThrow(f.runTimeout);assert.equal(f.panel.hidden,false);assert.doesNotThrow(f.ready);
});

test('early failures wait for the body and diagnostic data excludes query strings and arbitrary errors',()=>{
  const f=fixture({bodyReady:false});
  f.events.get('error')({target:{tagName:'SCRIPT',getAttribute:name=>name==='src'?'/_next/static/chunks/app.js?token=private':null},message:'a private error',stack:'private stack'});
  assert.equal(f.record().status,'resource-error');assert.deepEqual(f.record().failedResources,['/_next/static/chunks/app.js']);
  assert.doesNotMatch(JSON.stringify(f.record()),/private|token|stack/);
  f.setBodyReady();f.documentEvents.get('DOMContentLoaded')();assert.equal(f.panel.hidden,false);
});

test('a rendered error boundary records a generic failure code without exception details',()=>{
  const f=fixture();f.ready();f.events.get('jlpt:startup-failed')();assert.equal(f.record().status,'page-error');
});
