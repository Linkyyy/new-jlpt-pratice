import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/study-store.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const require = createRequire(import.meta.url), key = "jlpt-practice.study.v1";
const paper = { id: "N2-2026-vocabulary", level: "N2", year: "2026", typeLabel: "词汇", source: "original", questions: ["one", "two"].map(id => ({ id, level: "N2", category: "词汇", correctOptionId: "A", options: [{ id: "A" }, { id: "B" }] })) };
function store(initial) {
  const values = new Map(initial === undefined ? [] : [[key, typeof initial === "string" ? initial : JSON.stringify(initial)]]);
  let fail = false, writes = 0;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require, Intl, Date, URLSearchParams, window: { localStorage: {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => { if (fail) throw new Error("Quota exceeded"); writes++; values.set(name, value); },
  } } });
  return { api: exports, read: () => JSON.parse(values.get(key)), raw: () => values.get(key), writes: () => writes, fail: () => { fail = true; } };
}
const state = a => ({ answers: {}, status: a.status, questionIndex: a.questionIndex, deadline: a.deadline, elapsedSeconds: a.elapsedSeconds, timedOut: a.timedOut, fontSize: a.fontSize });

test("practice drafts survive reload; only submitted answers leave trails; repeated sessions retain separate scores", () => {
  const s = store(), a = s.api.createStudyAttempt(paper, "practice").attempt;
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "B", submitted: false } }, questionIndex: 1, fontSize: 24 }).ok, true);
  const restored = store(s.read()), saved = restored.read().attempts[0];
  assert.equal(saved.questionIndex, 1); assert.equal(saved.fontSize, 24);
  assert.equal(restored.api.questionTrails(restored.read()).size, 0);
  assert.equal(restored.api.updateStudyAttempt(a.id, { ...state(saved), status: "completed", answers: { one: { selectedOptionId: "B", submitted: true }, two: { selectedOptionId: "A", submitted: true } } }).ok, true);
  const completed = restored.read().attempts[0];
  assert.equal(restored.api.studyScore(completed).percent, 50);
  const second = restored.api.createStudyAttempt(paper, "practice").attempt;
  assert.notEqual(second.id, a.id);
  assert.equal(restored.api.updateStudyAttempt(second.id, { ...state(second), status: "completed", answers: { one: { selectedOptionId: "A", submitted: true }, two: { selectedOptionId: "A", submitted: true } } }).ok, true);
  assert.equal(restored.read().attempts.length, 2);
  assert.equal(restored.api.studySummary(restored.read()).unique, 2);
  assert.equal(restored.api.studySummary(restored.read()).completed, 2);
  const raw = restored.raw();
  assert.equal(restored.api.updateStudyAttempt(a.id, { ...state(completed), answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, false);
  assert.equal(restored.raw(), raw);
  assert.equal(restored.api.matchesStudyPaper(completed, paper, "practice"), true);
  assert.equal(restored.api.matchesStudyPaper(completed, { ...paper, questions: [...paper.questions].reverse() }, "practice"), false);
});

test("exam deadline is durable, answers stay ungraded before handing in, blanks are retained in the final score", () => {
  const s = store(), a = s.api.createStudyAttempt(paper, "exam").attempt;
  const deadline = Date.now() + 60000;
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), status: "active", deadline, answers: { one: { selectedOptionId: "A", submitted: false } } }).ok, true);
  const restored = store(s.read()), active = restored.read().attempts[0];
  assert.equal(active.deadline, deadline); assert.equal(restored.api.questionTrails(restored.read()).size, 0);
  assert.equal(restored.api.updateStudyAttempt(a.id, { ...state(active), status: "completed", deadline: null, elapsedSeconds: 60, timedOut: true, answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, true);
  const score = restored.api.studyScore(restored.read().attempts[0]);
  assert.equal(score.percent, 50); assert.equal(score.unanswered, 1); assert.equal(score.wrong, 0);
  assert.equal(restored.api.questionTrails(restored.read()).size, 1);
});

test("group drafts are saved without credit, group submissions are atomic and cannot be rewritten", () => {
  const s = store(), a = s.api.createStudyAttempt(paper, "practice").attempt;
  const draft = { one: { selectedOptionId: "A", submitted: false }, two: { selectedOptionId: "B", submitted: false } };
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: draft }).ok, true);
  assert.equal(s.api.studyScore(s.read().attempts[0]).answered, 0);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: Object.fromEntries(Object.entries(draft).map(([id, answer]) => [id, { ...answer, submitted: true }])) }).ok, true);
  assert.equal(s.api.studyScore(s.read().attempts[0]).answered, 2);
  const before = s.raw();
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "B", submitted: true } } }).ok, false);
  assert.equal(s.raw(), before);
});

test("corrupt records and quota failures never overwrite saved bytes", () => {
  for (const initial of ["{broken-json", { version: 1, attempts: [], activityDays: ["2026-02-31"] }]) {
    const s = store(initial), raw = s.raw();
    assert.ok(s.api.readStudySnapshot().error);
    assert.ok(s.api.createStudyAttempt(paper, "practice").error);
    assert.equal(s.raw(), raw); assert.equal(s.writes(), 0);
  }
  const s = store(), a = s.api.createStudyAttempt(paper, "practice").attempt, raw = s.raw();
  s.fail();
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, false);
  assert.equal(s.raw(), raw); assert.equal(s.api.questionTrails(s.api.readStudySnapshot().data).size, 0);
});

test("backup merging deduplicates sessions and preserves locked completed scores", () => {
  const s = store(), a = s.api.createStudyAttempt(paper, "exam").attempt;
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), status: "completed", answers: { one: { selectedOptionId: "B", submitted: true } } }).ok, true);
  const backup = s.read();
  backup.attempts[0].answers.one.selectedOptionId = "A";
  assert.equal(s.api.importStudyData(backup).ok, true);
  assert.equal(s.read().attempts[0].answers.one.selectedOptionId, "B");
  const other = store(), b = other.api.createStudyAttempt(paper, "practice").attempt;
  assert.notEqual(a.id, b.id);
  assert.equal(s.api.importStudyData(other.read()).ok, true);
  assert.equal(s.api.importStudyData(other.read()).ok, true);
  assert.equal(s.read().attempts.length, 2);
  const raw = s.raw();
  assert.equal(s.api.importStudyData({ version: 1, attempts: [a, a], activityDays: [] }).ok, false);
  assert.equal(s.raw(), raw);
});

test("JST days and streaks count distinct study days; achievements stay unlocked", () => {
  const s = store();
  assert.equal(s.api.studyDay(Date.parse("2026-10-15T15:00:00Z")), "2026-10-16");
  const data = { version: 1, attempts: [], activityDays: ["2026-10-12", "2026-10-13", "2026-10-14"] };
  assert.equal(s.api.studySummary(data, Date.parse("2026-10-15T05:00:00Z")).streak, 3);
  const later = s.api.studySummary(data, Date.parse("2026-10-17T05:00:00Z"));
  assert.equal(later.streak, 0); assert.equal(later.bestStreak, 3);
});
