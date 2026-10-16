import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/favorites-store.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const validation = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/lib/backup-validation.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: validation, Date });
const nodeRequire = createRequire(import.meta.url);
const require = specifier => specifier === "./backup-validation" ? validation : nodeRequire(specifier);
const key = "jlpt-practice.favorites.v1";
const date = "2026-01-01T00:00:00.000Z";
function store(initial) {
  const values = new Map(initial === undefined ? [] : [[key, JSON.stringify(initial)]]);
  let fail = false;
  let writes = 0;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require, window: { localStorage: {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => { if (fail) throw new Error("Quota exceeded"); writes++; values.set(name, value); },
  } }, console });
  return { api: exports, read: () => JSON.parse(values.get(key)), raw: () => values.get(key), writes: () => writes, fail: () => { fail = true; } };
}
const legacy = {
  version: 1,
  folders: [{ id: "default", name: "默认收藏夹" }, { id: "grammar", name: "语法" }],
  entries: [{ questionId: "old-question", folderId: "grammar", savedAt: date }],
};

test("legacy favorites survive multi-folder updates and reloads", () => {
  const s = store(legacy);
  assert.equal(s.api.saveFavorite("old-question", ["default", "grammar"]).ok, true);
  const data = s.read();
  assert.equal(data.version, 2);
  assert.equal(data.entries[0].savedAt, date);
  assert.deepEqual(data.entries[0].folderIds, ["default", "grammar"]);
  const reloaded = store(data);
  assert.equal(reloaded.api.saveFavorites(["old-question", "new-question"]).addedCount, 1);
  assert.deepEqual(reloaded.read().entries.find((entry) => entry.questionId === "old-question").folderIds, ["default", "grammar"]);
});

test("batch saves deduplicate questions and write atomically", () => {
  const s = store(legacy);
  assert.equal(s.api.saveFavorites(["old-question", "new-question", "new-question"]).addedCount, 1);
  assert.equal(s.writes(), 1);
  assert.equal(s.read().entries.length, 2);
  assert.deepEqual(s.read().entries.find((entry) => entry.questionId === "old-question").folderIds, ["grammar"]);
  assert.equal(s.api.saveFavorites(["new-question"]).addedCount, 0);
  const previous = s.raw();
  s.fail();
  assert.equal(s.api.saveFavorites(["quota-failure"]).ok, false);
  assert.equal(s.raw(), previous);
});

test("folder deletion retains other memberships and falls back only for orphaned questions", () => {
  const s = store({ ...legacy, folders: [...legacy.folders, { id: "other", name: "反复复习" }] });
  assert.equal(s.api.saveFavorite("shared", ["grammar", "other"]).ok, true);
  assert.equal(s.api.deleteFolder("grammar").ok, true);
  assert.equal(s.read().entries.length, 2);
  assert.deepEqual(s.read().entries.find((entry) => entry.questionId === "shared").folderIds, ["other"]);
  assert.deepEqual(s.read().entries.find((entry) => entry.questionId === "old-question").folderIds, ["default"]);
});

test("invalid existing storage and empty memberships are preserved on rejected writes", () => {
  const bad = store({ ...legacy, entries: [...legacy.entries, ...legacy.entries] });
  const raw = bad.raw();
  assert.equal(bad.api.saveFavorites(["another"]).ok, false);
  assert.equal(bad.raw(), raw);
  assert.equal(bad.writes(), 0);
  const good = store(legacy);
  assert.equal(good.api.saveFavorite("old-question", []).ok, false);
  assert.equal(good.writes(), 0);
});

const organized = {
  version: 2,
  folders: [...legacy.folders, { id: "reading", name: "阅读" }],
  entries: [
    { questionId: "shared", folderIds: ["grammar", "reading"], savedAt: date },
    { questionId: "grammar-only", folderIds: ["grammar"], savedAt: date },
    { questionId: "unselected", folderIds: ["default"], savedAt: date },
  ],
};

test("batch organization adds memberships without replacing others or original save dates", () => {
  const s = store(organized);
  const result = s.api.organizeFavorites(["shared", "grammar-only", "grammar-only"], "add-to-folder", "reading");
  assert.equal(result.ok, true);
  assert.equal(result.changedCount, 1);
  assert.equal(s.writes(), 1);
  assert.deepEqual(s.read().entries.slice(0, 2).map(entry => entry.folderIds), [["grammar", "reading"], ["grammar", "reading"]]);
  assert.ok(s.read().entries.every(entry => entry.savedAt === date));
  assert.deepEqual(s.read().entries[2], organized.entries[2]);
  assert.equal(s.api.organizeFavorites(["shared", "grammar-only"], "add-to-folder", "reading").changedCount, 0);
  assert.equal(s.writes(), 1, "unchanged batches do not write or trigger backup changes");
});

test("removing a folder membership retains other folders and gives orphaned favorites a default", () => {
  const s = store(organized);
  assert.equal(s.api.organizeFavorites(["shared", "grammar-only"], "remove-from-folder", "grammar").changedCount, 2);
  assert.equal(s.writes(), 1);
  assert.deepEqual(s.read().entries.map(entry => entry.folderIds), [["reading"], ["default"], ["default"]]);
  assert.equal(s.api.organizeFavorites(["grammar-only"], "remove-from-folder", "default").changedCount, 0);
  assert.equal(s.writes(), 1);
  assert.equal(s.read().entries.length, 3);
});

test("unfavorite removes only selected questions in one write, including all of their memberships", () => {
  const s = store(organized);
  assert.equal(s.api.organizeFavorites(["shared", "shared", "grammar-only"], "unfavorite").changedCount, 2);
  assert.equal(s.writes(), 1);
  assert.deepEqual(s.read(), { ...organized, entries: [organized.entries[2]] });
});

test("invalid or stale batch selections are rejected without partially changing favorites", () => {
  for (const [ids, action, folder] of [
    [[], "add-to-folder", "grammar"],
    [["shared"], "invalid-action", "grammar"],
    [["shared"], "remove-from-folder", "deleted-folder"],
    [["shared", "deleted-question"], "add-to-folder", "reading"],
    [["shared", "deleted-question"], "unfavorite"],
  ]) {
    const s = store(organized), before = s.raw();
    assert.equal(s.api.organizeFavorites(ids, action, folder).ok, false);
    assert.equal(s.raw(), before);
    assert.equal(s.writes(), 0);
  }
});

test("failed batch writes preserve all favorite entries and folder memberships", () => {
  for (const action of ["add-to-folder", "remove-from-folder", "unfavorite"]) {
    const s = store(organized), before = s.raw();
    s.fail();
    assert.equal(s.api.organizeFavorites(["shared", "grammar-only"], action, "reading").ok, false);
    assert.equal(s.raw(), before);
  }
});
