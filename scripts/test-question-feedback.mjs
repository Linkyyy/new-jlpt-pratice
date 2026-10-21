import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = Object.fromEntries(["frequency-feedback.server", "term-study-data", "frequency-term-feedback", "question-feedback", "question-feedback.server", "cloud-backup.server", "backup-validation", "study-history-data", "request-limits"].map(name => [name, ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText]));
const base = "https://jlpt.example", questionId = "imported:201407:N3:3:8363:73";
const valid = () => ({ questionId, issueType: "image", description: "最后一题的图片内容显示有误。" });
function environment({ configured = true, migrated = true, admins = "owner" } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec(fs.readFileSync(new URL("../migrations/0001-cloud-backup.sql", import.meta.url), "utf8"));
  if (migrated) database.exec(fs.readFileSync(new URL("../migrations/0002-question-feedback.sql", import.meta.url), "utf8"));
  const env = { FEEDBACK_ADMIN_USERS: admins, VERCEL: "1", ...(configured ? { CLOUDFLARE_ACCOUNT_ID: "test-account", CLOUDFLARE_D1_DATABASE_ID: "test-database", CLOUDFLARE_D1_API_TOKEN: "test-token" } : {}) };
  const modules = {};
  let now = Date.now(), online = true;
  class Clock extends Date { static now() { return now; } }
  function load(name) {
    if (!modules[name]) {
      const exports = {}; modules[name] = exports;
      vm.runInNewContext(compiled[name], { exports, require: dependency => dependency === "./bank-frequency.server" ? {loadFrequencyCorpus:async()=>({revision:"test-revision",terms:[["華々しい","はなばなしい","形容词","word"]],questions:[[questionId,"imported","N1","201007","vocabulary"]],units:[["prompt",[0],[0,1]]]}),findFrequencyTerm:(_corpus,term)=>["華々しい","はなばなしい"].includes(term.label)&&term.reading==="はなばなしい"&&term.pos==="形容词"&&term.kind==="word"?0:-1} : dependency === "@/data/imported-papers.server" ? { loadFavoriteQuestions: async ids => ids.filter(id => id === questionId || id === "N1-2026-词汇-1").map(id => ({ question: { id, level: id === questionId ? "N3" : "N1", category: id === questionId ? "阅读" : "词汇", sourceQuestionNumber: id === questionId ? 73 : null }, year: id === questionId ? "201407" : "2026", source: id === questionId ? "imported" : "original" })) } : dependency.startsWith("./") ? load(dependency.slice(2)) : require(dependency), process: { env }, Date: Clock, Buffer, URL, Response, Request, AbortSignal, Uint8Array,
        fetch: async (_url, options) => {
          if (!online) return Response.json({ success: false }, { status: 403 });
          const { sql, params } = JSON.parse(options.body);
          try { return Response.json({ success: true, result: [{ success: true, results: database.prepare(sql).all(...params) }] }); }
          catch { return Response.json({ success: false }, { status: 400 }); }
        } });
    }
    return modules[name];
  }
  const api = load("question-feedback.server"), authApi = load("cloud-backup.server");
  function request(path, body, cookie, { method, origin = base, ip = "203.0.113.10", contentType = "application/json", raw } = {}) {
    return new Request(base + path, { method: method ?? (body === undefined && raw === undefined ? "GET" : "POST"), headers: { origin, "content-type": contentType, "x-vercel-forwarded-for": ip, ...(cookie ? { cookie } : {}) }, ...(body === undefined && raw === undefined ? {} : { body: raw ?? JSON.stringify(body) }) });
  }
  async function auth(username = "owner") {
    const response = await authApi.cloudAuth(request("/api/cloud-backup/auth", { action: "register", username, password: "test-password", confirmPassword: "test-password" }));
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  }
  return { frequencyApi: load("frequency-feedback.server"), termModel: load("term-study-data"), api, authApi, database, request, auth, advance: seconds => { now += seconds * 1000; }, offline: () => { online = false; }, rules: load("question-feedback") };
}

test("known question metadata is resolved server-side and a report excludes private data", async () => {
  const e = environment();
  const submitted = await e.api.submitQuestionFeedback(e.request("/api/feedback", { ...valid(), level: "N1", period: "202612", source: "original", username: "evil", ip: "private", password: "private", answers: { all: "private" } }));
  assert.equal(submitted.status, 201);
  assert.match((await submitted.json()).id, /^[a-f0-9-]{36}$/);
  const row = e.database.prepare("SELECT * FROM question_feedback").get();
  assert.equal(row.level, "N3"); assert.equal(row.period, "201407"); assert.equal(row.question_number, 73); assert.equal(row.status, "new");
  assert.equal(JSON.stringify(row).includes("private"), false);
  assert.equal(Object.keys(row).some(key => /^(?:password|token|ip|user|user_id|submitted_by)$/.test(key)), false);
  assert.equal(e.database.prepare("SELECT key FROM cloud_rate_limits").get().key.includes("203.0.113.10"), false);
  assert.equal(e.rules.isFeedbackQuestionId("N1-2026-词汇-1"), true);
  assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", { ...valid(), questionId: "N1-2026-词汇-1" }))).status, 201);
});
test("anonymous and regular users cannot read or process reports; administrators can", async () => {
  const e = environment(), owner = await e.auth(), regular = await e.auth("learner");
  const sent = await e.api.submitQuestionFeedback(e.request("/api/feedback", valid())), id = (await sent.json()).id;
  assert.equal((await e.api.listQuestionFeedback(e.request("/api/feedback"))).status, 401);
  assert.equal((await e.api.listQuestionFeedback(e.request("/api/feedback", undefined, regular))).status, 403);
  assert.equal((await e.api.updateQuestionFeedback(e.request("/api/feedback", { id, status: "resolved" }, regular, { method: "PATCH" }))).status, 403);
  const list = await e.api.listQuestionFeedback(e.request("/api/feedback?status=new", undefined, owner));
  assert.equal(list.status, 200); assert.equal(list.headers.get("cache-control"), "no-store, private");
  assert.equal((await list.json()).items.length, 1);
  assert.equal((await e.api.updateQuestionFeedback(e.request("/api/feedback", { id, status: "resolved" }, owner, { method: "PATCH" }))).status, 200);
  assert.equal((await (await e.api.listQuestionFeedback(e.request("/api/feedback?status=new", undefined, owner))).json()).items.length, 0);
  const resolved = await (await e.api.listQuestionFeedback(e.request("/api/feedback?status=resolved", undefined, owner))).json();
  assert.equal(resolved.items[0].id, id); assert.equal(resolved.items[0].status, "resolved");
});
test("empty administrator allowlist denies every account and expired sessions cannot read", async () => {
  const missing = environment({ admins: "" }), user = await missing.auth();
  assert.equal((await missing.api.listQuestionFeedback(missing.request("/api/feedback", undefined, user))).status, 403);
  const e = environment({ admins: " OWNER,editor_1 " }), owner = await e.auth();
  assert.equal((await e.api.listQuestionFeedback(e.request("/api/feedback", undefined, owner))).status, 200);
  e.advance(31 * 86400);
  assert.equal((await e.api.listQuestionFeedback(e.request("/api/feedback", undefined, owner))).status, 401);
});
test("same-origin, known question, length and actual streamed size validation prevent inserts", async () => {
  const e = environment(), owner = await e.auth();
  assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", valid(), undefined, { origin: "https://evil.example" }))).status, 403);
  assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", valid(), undefined, { contentType: "text/plain" }))).status, 415);
  assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", undefined, undefined, { raw: "{" }))).status, 400);
  for (const body of [{ ...valid(), issueType: "hack" }, { ...valid(), description: "短" }, { ...valid(), description: "x".repeat(2001) }, { ...valid(), questionId: "../secret" }]) assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", body))).status, 400);
  assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", { ...valid(), questionId: "imported:201407:N3:3:9999:99" }))).status, 404);
  assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", { ...valid(), extra: "x".repeat(9000) }))).status, 413);
  assert.equal((await e.api.updateQuestionFeedback(e.request("/api/feedback", { id: "bad", status: "resolved" }, owner, { method: "PATCH", origin: "https://evil.example" }))).status, 403);
  assert.equal(e.database.prepare("SELECT COUNT(*) AS count FROM question_feedback").get().count, 0);
});
test("feedback SQL is parameterized and missing migration/config never report success", async () => {
  const e = environment(), owner = await e.auth(), text = "'); DROP TABLE cloud_users; -- <script>alert(1)</script>";
  assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", { ...valid(), description: text }))).status, 201);
  const items = (await (await e.api.listQuestionFeedback(e.request("/api/feedback", undefined, owner))).json()).items;
  assert.equal(items[0].description, text); assert.equal(e.database.prepare("SELECT COUNT(*) AS count FROM cloud_users").get().count, 1);
  for (const options of [{ configured: false }, { migrated: false }]) {
    const missing = environment(options), response = await missing.api.submitQuestionFeedback(missing.request("/api/feedback", valid()));
    assert.equal(response.status, 503); assert.equal((await response.text()).includes("test-token"), false);
  }
  e.offline();
  assert.equal((await e.api.listQuestionFeedback(e.request("/api/feedback", undefined, owner))).status, 503);
});
test("feedback pagination is stable and status changes reject invalid values", async () => {
  const e = environment(), owner = await e.auth(), start = Date.now();
  for (let index = 0; index < 57; index++) {
    const id = `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
    e.database.prepare("INSERT INTO question_feedback (id,question_id,level,period,category,source,question_number,issue_type,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, questionId, "N3", "201407", "阅读", "imported", 73, "image", "图片测试反馈", "new", start, start);
  }
  const first = await (await e.api.listQuestionFeedback(e.request("/api/feedback?status=new", undefined, owner))).json();
  assert.equal(first.items.length, 50); assert.ok(first.nextCursor);
  const next = await (await e.api.listQuestionFeedback(e.request(`/api/feedback?cursor=${encodeURIComponent(first.nextCursor)}`, undefined, owner))).json();
  assert.equal(next.items.length, 7); assert.equal(next.nextCursor, null);
  assert.equal(new Set([...first.items, ...next.items].map(item => item.id)).size, 57);
  assert.equal((await e.api.listQuestionFeedback(e.request("/api/feedback?status=invalid", undefined, owner))).status, 400);
  assert.equal((await e.api.listQuestionFeedback(e.request("/api/feedback?cursor=invalid", undefined, owner))).status, 400);
  assert.equal((await e.api.updateQuestionFeedback(e.request("/api/feedback", { id: first.items[0].id, status: "invalid" }, owner, { method: "PATCH" }))).status, 400);
  assert.equal((await e.api.updateQuestionFeedback(e.request("/api/feedback", { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", status: "resolved" }, owner, { method: "PATCH" }))).status, 404);
});
test("repeated feedback requests hit 429 without unbounded writes", async () => {
  const e = environment();
  for (let count = 0; count < 10; count++) assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", valid()))).status, 201);
  for (let count = 0; count < 5; count++) {
    const response = await e.api.submitQuestionFeedback(e.request("/api/feedback", valid()));
    assert.equal(response.status, 429); assert.ok(Number(response.headers.get("retry-after")) > 0);
  }
  assert.equal(e.database.prepare("SELECT COUNT(*) AS count FROM question_feedback").get().count, 10);
  e.advance(3601);
  assert.equal((await e.api.submitQuestionFeedback(e.request("/api/feedback", valid()))).status, 201);
});

test("term corrections reuse the existing feedback table and admin permissions, with canonical server snapshots",async()=>{
 const e=environment(),owner=await e.auth();const term={kind:"word",label:"はなばなしい",reading:"はなばなしい",pos:"形容词"};const body={key:e.termModel.termStudyKey(term),revision:"test-revision",issueType:"definition",description:"这个词的中文释义需要核对",label:"spoofed",ip:"private",password:"private"};
 const sent=await e.frequencyApi.submitFrequencyFeedback(e.request("/api/frequency/feedback",body));assert.equal(sent.status,201);const id=(await sent.json()).id;
 const stored=e.database.prepare("SELECT * FROM question_feedback WHERE id=?").get(id);assert.ok(stored.question_id.startsWith("frequency:"));assert.equal(stored.issue_type,"other");assert.ok(!stored.description.includes("private"));assert.equal(JSON.parse(stored.description).term.label,"華々しい");
 assert.equal((await e.api.listQuestionFeedback(e.request("/api/feedback"))).status,401);
 const record=(await(await e.api.listQuestionFeedback(e.request("/api/feedback",undefined,owner))).json()).items[0];assert.equal(record.termFeedback.term.label,"華々しい");assert.equal(record.termFeedback.issue,"definition");assert.equal(record.description,body.description);assert.deepEqual(record.termFeedback.exampleIds,[questionId]);
 assert.equal((await e.api.updateQuestionFeedback(e.request("/api/feedback",{id,status:"resolved"},owner,{method:"PATCH"}))).status,200);
});
test("term corrections reject stale index, unknown terms, malformed payloads and cross-origin requests",async()=>{
 const e=environment(),body={key:e.termModel.termStudyKey({kind:"word",label:"華々しい",reading:"はなばなしい",pos:"形容词"}),revision:"test-revision",issueType:"pos",description:"请检查这个词条的词性分类"};
 for(const[patch,status]of [[{revision:"old"},409],[{key:"12"},400],[{issueType:"not-a-type"},400],[{description:"短"},400],[{key:e.termModel.termStudyKey({kind:"word",label:"不存在",reading:"ない",pos:"名词"})},404]])assert.equal((await e.frequencyApi.submitFrequencyFeedback(e.request("/api/frequency/feedback",{...body,...patch}))).status,status);
 assert.equal((await e.frequencyApi.submitFrequencyFeedback(e.request("/api/frequency/feedback",body,undefined,{origin:"https://evil.example"}))).status,403);assert.equal(e.database.prepare("SELECT COUNT(*) AS n FROM question_feedback").get().n,0);
 const missing=environment({configured:false});assert.equal((await missing.frequencyApi.submitFrequencyFeedback(missing.request("/api/frequency/feedback",body))).status,503);
});
