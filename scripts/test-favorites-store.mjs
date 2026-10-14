import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/favorites-store.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const require = createRequire(import.meta.url);
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
