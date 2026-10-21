import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {readVisitToken, VISIT_ACCESS_KEY, safeAccessReturnPath} from '../src/lib/visit-access.mjs';

test('only the saved access token restores statistics access; study, favorites and display preferences never replace verification', () => {
  const data = new Map([
    ['jlpt-practice.study.v1', JSON.stringify({version:1,attempts:[]})],
    ['jlpt-practice.favorites.v1', JSON.stringify({version:2,entries:[]})],
    ['jlpt-practice.display.v1', JSON.stringify({theme:'light',locale:'zh'})],
  ]);
  const storage={getItem:key=>data.get(key)};
  assert.equal(readVisitToken(storage),null);
  data.set(VISIT_ACCESS_KEY,'a'.repeat(64));assert.equal(readVisitToken(storage),'a'.repeat(64));
  for (const value of ['', '112233', 'corrupt', null]) {data.set(VISIT_ACCESS_KEY,value);assert.equal(readVisitToken(storage),null);}
  assert.equal(readVisitToken({getItem:()=>{throw new Error('blocked')}}),null);
});
test('return targets preserve direct links but cannot redirect outside the site or loop to the access form', () => {
  assert.equal(safeAccessReturnPath('/frequency?grade=N2&level=N1'),'/frequency?grade=N2&level=N1');
  assert.equal(safeAccessReturnPath('/practice?question=test#question'),'/practice?question=test#question');
  for (const value of [undefined, ['bad'], 'https://evil.test', '//evil.test', '/\\evil.test', '/access?returnTo=/access', '/x\nLocation:x']) assert.equal(safeAccessReturnPath(value),'/');
});
test('browser tokens are opaque, cookie persistence is long-lived, and malformed or stale tokens are rejected', () => {
  const exports = {};
  const source = fs.readFileSync(new URL('../src/lib/browser-access.server.ts', import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Buffer,process:{env:{}},require: name=>name==='node:crypto'?crypto:{ACTIVATION_CODE_DIGEST:crypto.createHash('sha256').update('112233').digest('hex')}});
  const token=exports.browserAccessToken();
  assert.match(token,/^[a-f0-9]{64}$/); assert.equal(exports.verifyBrowserAccessToken(token),true);
  for (const value of [undefined, null, 123, '112233', 'a'.repeat(64), token+'x']) assert.equal(exports.verifyBrowserAccessToken(value),false);
  assert.equal(exports.ACTIVATION_MAX_AGE,400*24*60*60);
});
