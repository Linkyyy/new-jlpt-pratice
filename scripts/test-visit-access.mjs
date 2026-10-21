import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {previousVisit, safeAccessReturnPath} from '../src/lib/visit-access.mjs';

test('legacy visitors are recognized from saved records/settings, without modifying them or granting access to empty/corrupt storage', () => {
  for (const [key, value] of [['study', {version:1,attempts:[]}], ['favorites',{version:2,entries:[]}], ['preferences',{version:1,home:{},practice:{}}], ['display',{theme:'system',locale:'ja'}]]) {
    const data = new Map([[`jlpt-practice.${key}.v1`, JSON.stringify(value)]]);
    assert.equal(previousVisit({getItem:key=>data.get(key)}),true);
    assert.equal(data.size,1);
  }
  for (const value of [null, 'broken JSON', '{}', '{"version":1}', '{"locale":"xx","theme":"system"}']) assert.equal(previousVisit({getItem:()=>value}),false);
  assert.equal(previousVisit({getItem:()=>{throw new Error('blocked')}}),false);
});
test('return targets preserve direct links but cannot redirect outside the site or loop to the access form', () => {
  assert.equal(safeAccessReturnPath('/frequency?grade=N2&level=N1'),'/frequency?grade=N2&level=N1');
  assert.equal(safeAccessReturnPath('/practice?question=test#question'),'/practice?question=test#question');
  for (const value of [undefined, ['bad'], 'https://evil.test', '//evil.test', '/\\evil.test', '/access?returnTo=/access', '/x\nLocation:x']) assert.equal(safeAccessReturnPath(value),'/');
});
test('browser tokens are opaque, cookie persistence is long-lived, and malformed or stale tokens are rejected', () => {
  const exports = {};
  const source = fs.readFileSync(new URL('../src/lib/browser-access.server.ts', import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Buffer,require: name=>name==='node:crypto'?crypto:{ACTIVATION_CODE_DIGEST:crypto.createHash('sha256').update('112233').digest('hex')}});
  const token=exports.browserAccessToken();
  assert.match(token,/^[a-f0-9]{64}$/); assert.equal(exports.verifyBrowserAccessToken(token),true);
  for (const value of [undefined, null, 123, '112233', 'a'.repeat(64), token+'x']) assert.equal(exports.verifyBrowserAccessToken(value),false);
  assert.equal(exports.ACTIVATION_MAX_AGE,400*24*60*60);
});
