import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = Object.fromEntries(["cloud-backup.server", "backup-validation", "study-history-data"].map(name => [name, ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText]));
const base = "https://jlpt.example";
const emptyBackup = () => ({ format: "jlpt-practice-backup", version: 1, exportedAt: new Date().toISOString(), favorites: { version: 2, folders: [{ id: "default", name: "默认收藏夹" }], entries: [] }, study: { version: 1, attempts: [], activityDays: [] } });
function environment(configured = true) {
  const database = new DatabaseSync(":memory:");
  database.exec(fs.readFileSync(new URL("../migrations/0001-cloud-backup.sql", import.meta.url), "utf8"));
  const env = configured ? { CLOUDFLARE_ACCOUNT_ID: "test-account", CLOUDFLARE_D1_DATABASE_ID: "test-database", CLOUDFLARE_D1_API_TOKEN: "test-secret-not-real" } : {};
  let online = true, now = Date.now(), beforeUpdate = null;
  class Clock extends Date { static now() { return now; } }
  const modules = {};
  function load(name) {
    if (!modules[name]) {
      const exports = {}; modules[name] = exports;
      vm.runInNewContext(compiled[name], { exports, require: name => name.startsWith("./") ? load(name.slice(2)) : require(name), process: { env }, Date: Clock, Buffer, URL, Response, Request, AbortSignal, Uint8Array,
        fetch: async (url, options) => {
          assert.equal(url, "https://api.cloudflare.com/client/v4/accounts/test-account/d1/database/test-database/query");
          assert.equal(options.headers.Authorization, "Bearer test-secret-not-real");
          assert.equal(options.cache, "no-store");
          if (!online) return Response.json({ success: false, errors: [{ message: "private upstream error" }] }, { status: 403 });
          const { sql, params } = JSON.parse(options.body);
          if (beforeUpdate && sql.startsWith("UPDATE cloud_backups")) { const operation = beforeUpdate; beforeUpdate = null; operation(database); }
          const results = database.prepare(sql).all(...params);
          return Response.json({ success: true, result: [{ success: true, results }] });
        } });
    }
    return modules[name];
  }
  const api = load("cloud-backup.server");
  const request = (path, body, cookie, origin = base) => new Request(base + path, { method: body === undefined ? "GET" : "POST", headers: { ...(body === undefined ? {} : { origin, "content-type": "application/json" }), ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  async function auth(username = "alice", action = "register", password = "test-password", cookie) {
    const response = await api.cloudAuth(request("/api/cloud-backup/auth", { username, password, action, ...(action === "register" ? { confirmPassword: password } : {}) }, cookie));
    return { response, cookie: response.headers.get("set-cookie")?.split(";")[0], data: await response.json() };
  }
  const read = (cookie, account = "alice") => api.cloudRead(request(`/api/cloud-backup?account=${account}`, undefined, cookie));
  const write = (cookie, data = emptyBackup(), expectedRevision = null, expectedUsername = "alice") => api.cloudWrite(request("/api/cloud-backup", { data, expectedRevision, expectedUsername }, cookie));
  return { api, database, auth, request, read, write, beforeUpdate: callback => { beforeUpdate = callback; }, offline: () => { online = false; }, advance: seconds => { now += seconds * 1000; } };
}

test("password hashes use distinct salts and reject incorrect passwords", async () => {
  const e = environment();
  const a = await e.api.hashPassword("test-password"), b = await e.api.hashPassword("test-password");
  assert.notEqual(a, b); assert.equal(a.includes("test-password"), false);
  assert.equal(await e.api.verifyPassword("test-password", a), true);
  assert.equal(await e.api.verifyPassword("wrong-password", a), false);
  assert.equal(await e.api.verifyPassword("test-password", "malformed"), false);
});
test("register/login issue HttpOnly secure sessions; logout and expiry invalidate them", async () => {
  const e = environment();
  const registered = await e.auth("Alice");
  assert.equal(registered.response.status, 200); assert.equal(registered.data.user.username, "alice");
  assert.match(registered.response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  const stored = e.database.prepare("SELECT * FROM cloud_sessions").get();
  assert.equal(registered.cookie.includes(stored.token_hash), false);
  assert.equal((await e.auth("alice", "login", "wrong-password")).response.status, 401);
  assert.deepEqual((await e.auth("missing", "login")).data, { error: "账号或密码不正确。" });
  assert.equal((await e.auth("alice")).response.status, 409);
  const loggedIn = await e.auth("ALICE", "login");
  assert.equal(loggedIn.response.status, 200);
  assert.equal((await e.api.cloudStatus(e.request("/api/cloud-backup/auth", undefined, loggedIn.cookie))).status, 200);
  const logout = await e.api.cloudAuth(e.request("/api/cloud-backup/auth", { action: "logout" }, loggedIn.cookie));
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await e.read(loggedIn.cookie)).status, 401);
  e.advance(31 * 24 * 3600);
  assert.equal((await e.read(registered.cookie)).status, 401);
});
test("backups round trip with account isolation and optimistic overwrite protection", async () => {
  const e = environment(), alice = await e.auth(), bob = await e.auth("bob");
  const backup = emptyBackup();
  backup.favorites.entries.push({ questionId: "sample", folderIds: ["default"], savedAt: new Date().toISOString() });
  assert.equal((await e.read()).status, 401);
  assert.equal((await e.write(bob.cookie, backup, null, "alice")).status, 409);
  assert.equal((await e.write(alice.cookie, backup)).status, 200);
  const read = await e.read(alice.cookie), saved = await read.json();
  assert.equal(read.headers.get("cache-control"), "no-store, private");
  assert.deepEqual(saved.data, backup);
  assert.equal((await e.read(bob.cookie, "bob")).status, 404);
  assert.equal((await e.read(bob.cookie, "alice")).status, 409);
  assert.equal((await e.write(bob.cookie, backup, null, "bob")).status, 200);
  assert.equal((await e.write(alice.cookie)).status, 409);
  assert.equal((await e.write(alice.cookie, backup, "stale-revision")).status, 409);
  const updated = await e.write(alice.cookie, emptyBackup(), saved.backup.revision);
  assert.equal(updated.status, 200);
  assert.notEqual((await updated.json()).backup.revision, saved.backup.revision);
  assert.deepEqual((await (await e.read(bob.cookie, "bob")).json()).data, backup);
});
test("invalid data, oversized bodies and foreign origins do not overwrite stored backup", async () => {
  const e = environment(), alice = await e.auth();
  await e.write(alice.cookie);
  const saved = await (await e.read(alice.cookie)).json();
  const invalid = emptyBackup(); invalid.study.attempts = [{ id: "invalid" }];
  assert.equal((await e.write(alice.cookie, invalid, saved.backup.revision)).status, 400);
  const large = emptyBackup(); large.extra = "x".repeat(1024 * 1024 + 5000);
  assert.equal((await e.write(alice.cookie, large, saved.backup.revision)).status, 413);
  const wrongOrigin = e.request("/api/cloud-backup", { data: emptyBackup(), expectedRevision: saved.backup.revision }, alice.cookie, "https://evil.example");
  assert.equal((await e.api.cloudWrite(wrongOrigin)).status, 403);
  assert.equal((await e.api.cloudAuth(e.request("/api/cloud-backup/auth", { action: "logout" }, alice.cookie, "https://evil.example"))).status, 403);
  assert.equal((await e.write(alice.cookie, emptyBackup(), saved.backup.revision)).status, 200);
  // A corrupt remote snapshot must never be returned as a successful import.
  e.database.prepare("UPDATE cloud_backups SET data = ?").run(JSON.stringify(invalid));
  assert.equal((await e.read(alice.cookie)).status, 422);
});
test("durable login throttling resets after its time window", async () => {
  const e = environment(); await e.auth();
  for (let i = 0; i < 14; i++) assert.equal((await e.auth("alice", "login", "wrong-password")).response.status, 401);
  assert.equal((await e.auth("alice", "login")).response.status, 429);
  e.advance(901);
  assert.equal((await e.auth("alice", "login")).response.status, 200);
});
test("unconfigured or unavailable D1 responds safely without secrets", async () => {
  const missing = environment(false);
  assert.deepEqual(await (await missing.api.cloudStatus(missing.request("/api/cloud-backup/auth"))).json(), { configured: false, user: null, backup: null });
  const response = await missing.auth();
  assert.equal(response.response.status, 503);
  const e = environment(); e.offline();
  const failed = await e.auth();
  assert.equal(failed.response.status, 503); assert.equal(failed.data.error, "云服务暂时不可用，请稍后重试。");
  assert.equal(JSON.stringify(failed.data).includes("secret"), false);
});

test("registration requires a matching second password; login needs only the password", async () => {
  const e = environment();
  for (const confirmPassword of [undefined, "different-password"]) {
    const response = await e.api.cloudAuth(e.request("/api/cloud-backup/auth", { action: "register", username: "alice", password: "test-password", confirmPassword }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "两次输入的密码不一致。");
    assert.equal(e.database.prepare("SELECT count(*) AS n FROM cloud_users").get().n, 0);
  }
  assert.equal((await e.auth()).response.status, 200);
  assert.equal((await e.auth("alice", "login")).response.status, 200);
});
function historyBackup() {
  const backup = emptyBackup(), now = Date.now();
  backup.favorites.folders.push({ id: "remote-folder", name: "只在云端" });
  backup.favorites.entries.push({ questionId: "cloud-only", folderIds: ["default", "remote-folder"], savedAt: new Date().toISOString() });
  backup.study.attempts = ["attempt-1", "attempt-2"].map(id => ({ id, paperId: "paper", source: "original", level: "N2", year: "2026", type: "vocabulary", typeLabel: "词汇", periodLabel: "2026 原创版", mode: "practice", createdAt: now, updatedAt: now, completedAt: now, questions: [{ id: "q1", level: "N2", category: "词汇", correctOptionId: "A", optionIds: ["A", "B"] }], answers: { q1: { selectedOptionId: "A", submitted: true } }, status: "completed", questionIndex: 0, deadline: null, elapsedSeconds: 0, timedOut: false, fontSize: 18 }));
  backup.study.activityDays = ["2026-10-15"];
  return backup;
}
const removeHistory = (e, cookie, attemptId, revision, username = "alice", origin = base) => e.api.cloudDeleteHistory(new Request(e.request("/api/cloud-backup/history", { attemptId, expectedRevision: revision, expectedUsername: username }, cookie, origin), { method: "DELETE" }));
test("single and all history deletion preserve the cloud's folders/favorites and other accounts", async () => {
  const e = environment(), alice = await e.auth(), bob = await e.auth("bob");
  const original = historyBackup();
  await e.write(alice.cookie, original);
  await e.write(bob.cookie, original, null, "bob");
  const old = await (await e.read(alice.cookie)).json();
  assert.equal((await removeHistory(e, alice.cookie, "attempt-1", old.backup.revision)).status, 200);
  const single = await (await e.read(alice.cookie)).json();
  assert.deepEqual(single.data.study.attempts.map(a => a.id), ["attempt-2"]);
  assert.deepEqual(single.data.favorites, original.favorites);
  assert.notEqual(single.backup.revision, old.backup.revision);
  assert.equal((await removeHistory(e, alice.cookie, "attempt-1", single.backup.revision)).status, 200);
  assert.equal((await removeHistory(e, alice.cookie, null, single.backup.revision)).status, 200);
  const cleared = await (await e.read(alice.cookie)).json();
  assert.deepEqual(cleared.data.study, { version: 1, attempts: [], activityDays: [] });
  assert.deepEqual(cleared.data.favorites, original.favorites);
  assert.deepEqual((await (await e.read(bob.cookie, "bob")).json()).data, original);
  assert.equal((await e.api.cloudStatus(e.request("/api/cloud-backup/auth", undefined, alice.cookie))).status, 200);
});
test("history deletion enforces session, origin, identity and revision; failures leave the backup intact", async () => {
  const e = environment(), alice = await e.auth();
  await e.write(alice.cookie, historyBackup());
  const saved = await (await e.read(alice.cookie)).json();
  assert.equal((await removeHistory(e, undefined, null, saved.backup.revision)).status, 401);
  assert.equal((await removeHistory(e, alice.cookie, null, saved.backup.revision, "alice", "https://evil.example")).status, 403);
  assert.equal((await removeHistory(e, alice.cookie, null, saved.backup.revision, "bob")).status, 409);
  assert.equal((await removeHistory(e, alice.cookie, null, "stale-revision")).status, 409);
  assert.equal((await removeHistory(e, alice.cookie, "", saved.backup.revision)).status, 400);
  assert.deepEqual((await (await e.read(alice.cookie)).json()).data, saved.data);
  e.offline();
  assert.equal((await removeHistory(e, alice.cookie, null, saved.backup.revision)).status, 503);
  assert.deepEqual(JSON.parse(e.database.prepare("SELECT data FROM cloud_backups").get().data), saved.data);
});
test("logged-in accounts without a cloud backup can still delete local history without creating a backup", async () => {
  const e = environment(), alice = await e.auth();
  assert.equal((await removeHistory(e, alice.cookie, null, null)).status, 200);
  assert.equal(e.database.prepare("SELECT count(*) AS n FROM cloud_backups").get().n, 0);
  assert.equal(e.database.prepare("SELECT count(*) AS n FROM cloud_users").get().n, 1);
});

test("a backup changed between read and delete cannot lose the other device's data", async () => {
  const e = environment(), alice = await e.auth();
  const original = historyBackup();
  await e.write(alice.cookie, original);
  const saved = await (await e.read(alice.cookie)).json();
  const concurrent = structuredClone(original);
  concurrent.favorites.folders.push({ id: "concurrent", name: "刚刚新增" });
  e.beforeUpdate(database => database.prepare("UPDATE cloud_backups SET data = ?, revision = ?").run(JSON.stringify(concurrent), "other-device-revision"));
  assert.equal((await removeHistory(e, alice.cookie, null, saved.backup.revision)).status, 409);
  assert.deepEqual((await (await e.read(alice.cookie)).json()).data, concurrent);
});
