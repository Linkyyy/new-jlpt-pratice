import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../src/lib/request-limits.ts", import.meta.url), "utf8");
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function environment(env = {}) {
  const exports = {};
  vm.runInNewContext(compile(source), { exports, require, process: { env }, Date, Buffer, Response, Request, Uint8Array });
  return exports;
}
const request = (body = "{}", headers = {}) => new Request("https://jlpt.example/api/favorites/questions", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

test("burst limits isolate keys, cap rejected counters and reset at the window boundary", () => {
  const api = environment(); let now = 1000;
  const consume = api.createMemoryRateLimiter(100, () => now);
  assert.equal(consume("alice", 2, 60), null);
  assert.equal(consume("alice", 2, 60), null);
  assert.equal(consume("alice", 2, 60), 59);
  assert.equal(consume("bob", 2, 60), null);
  for (let i = 0; i < 1000; i++) assert.equal(consume("alice", 2, 60), 59);
  now = 60000;
  assert.equal(consume("alice", 2, 60), null);
});
test("new identifiers cannot grow the in-memory limiter beyond its bounded capacity", () => {
  const api = environment(); let now = 1000;
  const consume = api.createMemoryRateLimiter(2, () => now);
  assert.equal(consume("a", 2, 60), null);
  assert.equal(consume("b", 2, 60), null);
  assert.ok(consume("c", 2, 60) > 0);
  assert.equal(consume("a", 2, 60), null);
  now = 60000;
  assert.equal(consume("c", 2, 60), null);
});
test("production trusts Vercel's IP header and ignores client-supplied forwarding fallbacks", () => {
  const api = environment({ VERCEL: "1" });
  assert.equal(api.requestClientIp(request("{}", { "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "198.51.100.6" })), "203.0.113.9");
  assert.equal(api.requestClientIp(request("{}", { "x-forwarded-for": "198.51.100.6" })), "unknown");
  assert.equal(api.requestClientIp(request("{}", { "x-vercel-forwarded-for": "spoofed" })), "unknown");
  assert.equal(api.requestClientIp(request("{}", { "x-vercel-forwarded-for": "2001:db8::1" })), "2001:db8::1");
  assert.equal(environment().requestClientIp(request("{}", { "x-forwarded-for": "198.51.100.6" })), "unknown");
  assert.equal(environment({ TRUST_PROXY_IP_HEADERS: "true" }).requestClientIp(request("{}", { "x-forwarded-for": "198.51.100.6, 10.0.0.1" })), "198.51.100.6");
});
test("429 responses include Retry-After, do not cache errors and keep scopes separate", async () => {
  const api = environment();
  const options = { scope: "test", limit: 1, windowSeconds: 3600 };
  assert.equal(api.checkApiRateLimit(request(), options), null);
  const denied = api.checkApiRateLimit(request(), options);
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get("retry-after")) > 0);
  assert.match(denied.headers.get("cache-control"), /no-store/);
  assert.equal(api.checkApiRateLimit(request(), { ...options, scope: "other" }), null);
  assert.deepEqual(await denied.json(), { error: "操作过于频繁，请稍后重试。" });
});
test("body limits check actual UTF-8 bytes even when Content-Length is missing or false", async () => {
  const api = environment();
  const text = JSON.stringify({ value: "日本語" });
  assert.equal((await api.readLimitedJson(request(text), 100)).value, "日本語");
  for (const headers of [{}, { "content-length": "1" }]) {
    await assert.rejects(api.readLimitedJson(request(text, headers), 10), error => error.status === 413);
  }
  await assert.rejects(api.readLimitedJson(request("{}", { "content-length": "100" }), 10), error => error.status === 413);
  await assert.rejects(api.readLimitedJson(request("broken"), 100), error => error.status === 400);
  await assert.rejects(api.readLimitedJson(request("{}", { "content-type": "text/plain" }), 100), error => error.status === 415);
});
test("oversized streamed requests are cancelled before their remaining chunks are consumed", async () => {
  const api = environment(); let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(100))); }, cancel() { cancelled = true; } });
  const req = new Request("https://jlpt.example/api/test", { method: "POST", body, duplex: "half", headers: { "content-type": "application/json" } });
  await assert.rejects(api.readLimitedJson(req, 10), error => error.status === 413);
  assert.equal(cancelled, true);
});
test("favorite question APIs rate-limit before loading content and reject chunked oversized bodies", async () => {
  const limits = environment(); let loads = 0;
  const routes = ["favorites/questions", "practice/favorites"].map(path => {
    const exports = {};
    vm.runInNewContext(compile(fs.readFileSync(new URL(`../src/app/api/${path}/route.ts`, import.meta.url), "utf8")), {
      exports, Response, Request,
      require: name => name === "@/lib/request-limits" ? limits : name === "@/lib/activation.server" ? { isActivated: async () => true } : { loadFavoriteQuestions: async ids => { loads++; return ids.map(id => ({ id })); } },
    });
    return exports;
  });
  const valid = JSON.stringify({ ids: ["sample", "sample"] });
  const result = await routes[0].POST(request(valid));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { questions: [{ id: "sample" }] });
  assert.equal((await routes[1].POST(request(JSON.stringify({ ids: ["x".repeat(31000)] })))).status, 413);
  for (let i = 0; i < 118; i++) assert.equal((await routes[i % 2].POST(request(valid))).status, 200);
  const previous = loads;
  const denied = await routes[0].POST(request(valid));
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get("retry-after")) > 0);
  assert.equal(loads, previous);
});
