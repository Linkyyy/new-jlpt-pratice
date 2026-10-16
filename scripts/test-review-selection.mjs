import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/app/favorites/review-selection.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports });
const { collectionEntries, collectionPracticeIds, collectionView } = exports;
const now = Date.parse("2026-10-16T04:00:00Z");
const favorites = { version: 2, folders: [{ id: "default", name: "默认收藏夹" }, { id: "saved", name: "Saved" }], entries: [{ questionId: "saved-q", folderIds: ["saved"], savedAt: "2026-10-01T00:00:00Z" }] };
const insight = (questionId, wrongCount, dueAt, lastAnsweredAt = now - 86_400_000) => ({ questionId, wrongCount, dueAt, lastAnsweredAt, level: "N3", category: "阅读", answeredCount: wrongCount + 1, correctCount: 1, lastCorrect: true, consecutiveCorrect: 1, reviewStatus: dueAt <= now ? "due" : "scheduled" });
const insights = new Map([
  ["saved-q", insight("saved-q", 1, now - 1000)],
  ["not-saved", insight("not-saved", 5, now)],
  ["scheduled", insight("scheduled", 2, now + 1)],
  ["always-correct", insight("always-correct", 0, now - 1000)],
]);
const plain = value => JSON.parse(JSON.stringify(value));

test("wrong answers appear without creating favorites and remain after a later correct answer", () => {
  const before = JSON.stringify(favorites);
  const entries = collectionEntries(favorites, insights, "mistakes", now);
  assert.deepEqual(plain(entries.map(entry => entry.questionId)), ["not-saved", "scheduled", "saved-q"]);
  assert.deepEqual(plain(entries[0].folderIds), []);
  assert.deepEqual(plain(entries[2].folderIds), ["saved"]);
  assert.equal(JSON.stringify(favorites), before);
  assert.equal(favorites.entries.length, 1);
});

test("due review includes the exact due instant, excludes scheduled and never-wrong questions", () => {
  const entries = collectionEntries(favorites, insights, "due", now);
  assert.deepEqual(plain(entries.map(entry => entry.questionId)), ["saved-q", "not-saved"]);
});

test("existing favorite folder and single-question filtering is preserved", () => {
  assert.strictEqual(collectionEntries(favorites, insights, "favorites", now), favorites.entries);
  assert.deepEqual(plain(collectionPracticeIds(favorites.entries, "favorites", "saved")), ["saved-q"]);
  assert.deepEqual(plain(collectionPracticeIds(favorites.entries, "favorites", "default")), []);
  assert.deepEqual(plain(collectionPracticeIds(favorites.entries, "favorites", "saved", "not-saved")), []);
});

test("wrong-question exercises ignore stale folder filtering, snapshot unique known history IDs only", () => {
  const entries = collectionEntries(favorites, insights, "mistakes", now);
  assert.deepEqual(plain(collectionPracticeIds([...entries, entries[0]], "mistakes", "default")), ["not-saved", "scheduled", "saved-q"]);
  assert.deepEqual(plain(collectionPracticeIds(entries, "mistakes", "default", "not-saved")), ["not-saved"]);
  assert.deepEqual(plain(collectionPracticeIds(entries, "mistakes", "all", "arbitrary-q")), []);
  assert.equal(collectionView("untrusted-view"), "favorites");
});
