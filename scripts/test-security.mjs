import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function environment(env = {}, overrides = {}) {
  const modules = {};
  function load(name) {
    name = name.replace(/^@\/lib\//, '').replace(/^\.\//, '');
    if (overrides[name]) return overrides[name];
    if (modules[name]) return modules[name];
    const exports = {}; modules[name] = exports;
    const file = new URL(`../src/${name.startsWith('app/') ? '' : 'lib/'}${name}.ts`, import.meta.url);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code, {exports, Buffer, URL, Response, Request, Date, Uint8Array, process: {env}, require: dependency => dependency.startsWith('./') || dependency.startsWith('@/lib/') ? load(dependency) : require(dependency)});
    return exports;
  }
  return {load};
}
const req = (path = '/api/frequency', init = {}) => new Request(`https://jlpt.example${path}`, init);

test('statistics API rejects direct and cross-site access but accepts a valid remembered visit', () => {
  const e = environment({ACCESS_TOKEN_SECRET: 's'.repeat(64)}), gate = e.load('frequency-access.server');
  assert.equal(gate.checkFrequencyAccess(req()).status, 401);
  assert.equal(gate.checkFrequencyAccess(req('/api/frequency/export?format=pdf')).status, 401);
  const token = e.load('browser-access.server').browserAccessToken();
  const headers = {cookie: `other=one; jlpt_activation=${token}; last=two`};
  assert.equal(gate.checkFrequencyAccess(req('/api/frequency', {headers})), null);
  assert.equal(gate.checkFrequencyAccess(req('/api/frequency', {headers: {...headers, origin: 'https://evil.example'}})).status, 403);
  assert.equal(gate.checkFrequencyAccess(req('/api/frequency', {headers: {...headers, 'sec-fetch-site': 'cross-site'}})).status, 403);
  assert.equal(gate.checkFrequencyAccess(req('/api/frequency', {headers: {cookie: `jlpt_activation_evil=${token}`}})).status, 401);
});

test('secret-backed tokens cannot be derived from the public digest or survive a secret rotation', () => {
  const legacy = environment().load('browser-access.server').browserAccessToken();
  const signed = environment({ACCESS_TOKEN_SECRET: 's'.repeat(64)}).load('browser-access.server');
  const other = environment({ACCESS_TOKEN_SECRET: 't'.repeat(64)}).load('browser-access.server');
  assert.notEqual(signed.browserAccessToken(), legacy);
  assert.equal(signed.verifyBrowserAccessToken(legacy), false);
  assert.equal(other.verifyBrowserAccessToken(signed.browserAccessToken()), false);
  assert.equal(signed.verifyBrowserAccessToken(signed.browserAccessToken()), true);
  assert.throws(() => environment({ACCESS_TOKEN_SECRET: 'too-short'}).load('browser-access.server').browserAccessToken(), /32/);
});

test('security rejects cross-site API calls, unsupported methods, oversized targets/bodies and scan probes', () => {
  const guard = environment().load('request-security').checkRequestSecurity;
  assert.equal(guard(req('/api/activation', {method: 'POST', headers: {origin: 'https://evil.example'}})).status, 403);
  assert.equal(guard(req('/api/frequency', {headers: {'sec-fetch-site': 'cross-site'}})).status, 403);
  assert.equal(guard(req('/api/frequency', {method: 'OPTIONS'})).status, 405);
  assert.equal(guard(req('/api/cloud-backup', {method: 'POST', headers: {'content-length': '1048577'}})).status, 413);
  assert.equal(guard(req('/practice?q=' + 'x'.repeat(8192))).status, 414);
  for (const path of ['/.env', '/.env.local', '/.git/config', '/%2egit/config', '/wp-login.php', '/wp-admin/install.php']) assert.equal(guard(req(path)).status, 404, path);
  for (const path of ['/', '/practice', '/favorites', '/api/favorites/questions']) assert.equal(guard(req(path)), null, path);
  // A cross-site link to a page is permitted; only cross-site API calls are refused.
  assert.equal(guard(req('/practice', {headers: {'sec-fetch-site': 'cross-site'}})), null);
});

test('aggregate API bursts are rejected across routes and cannot evade limits with spoofed X-Forwarded-For', () => {
  const guard = environment({VERCEL: '1'}).load('request-security').checkRequestSecurity;
  for (let i = 0; i < 40; i++) assert.equal(guard(req(`/api/${i}`, {headers: {'x-vercel-forwarded-for': '203.0.113.1', 'x-forwarded-for': `192.0.2.${i}`}})), null);
  const denied = guard(req('/api/another', {headers: {'x-vercel-forwarded-for': '203.0.113.1'}}));
  assert.equal(denied.status, 429); assert.ok(Number(denied.headers.get('retry-after')) > 0);
  assert.match(denied.headers.get('cache-control'), /no-store/);
  assert.equal(guard(req('/api/another', {headers: {'x-vercel-forwarded-for': '203.0.113.2'}})), null);
});

test('route handlers gate queries, exports and feedback before their heavy dependencies run', async () => {
  for (const path of ['app/api/frequency/route', 'app/api/frequency/export/route', 'app/api/frequency/feedback/route']) {
    const exports = {}, source = fs.readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8'); let heavyCalls = 0;
    const denied = new Response('{}', {status: 401});
    const e = environment({}, {'frequency-access.server': {checkFrequencyAccess: () => denied}});
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {exports, Response, Request, URL, process: {env: {}}, require: dependency => {
      if (dependency === '@/lib/frequency-access.server') return e.load('frequency-access.server');
      if (dependency === '@/lib/request-limits') return e.load('request-limits');
      return {loadFrequencyCorpus: () => {heavyCalls++; throw Error('must not load');}, submitFrequencyFeedback: () => {heavyCalls++; throw Error('must not submit');}};
    }});
    assert.equal((await (exports.GET ?? exports.POST)(req())).status, 401);
    assert.equal(heavyCalls, 0, path);
  }
});
