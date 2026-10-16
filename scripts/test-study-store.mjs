import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/study-store.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const validation = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/lib/backup-validation.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: validation, Date });
const historyData = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/lib/study-history-data.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: historyData });
const practiceScoring = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/lib/practice-scoring.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: practiceScoring });
const nodeRequire = createRequire(import.meta.url);
const require = specifier => specifier === "./backup-validation" ? validation : specifier === "./study-history-data" ? historyData : specifier === "./practice-scoring" ? practiceScoring : nodeRequire(specifier), key = "jlpt-practice.study.v1";
const paper = { id: "N2-2026-vocabulary", level: "N2", year: "2026", typeLabel: "词汇", source: "original", questions: ["one", "two"].map(id => ({ id, level: "N2", category: "词汇", correctOptionId: "A", options: [{ id: "A" }, { id: "B" }] })) };
function store(initial, clock = Date) {
  const values = new Map(initial === undefined ? [] : [[key, typeof initial === "string" ? initial : JSON.stringify(initial)]]);
  let fail = false, writes = 0;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require, Intl, Date: clock, URLSearchParams, window: { localStorage: {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => { if (fail) throw new Error("Quota exceeded"); writes++; values.set(name, value); },
  } } });
  return { api: exports, read: () => JSON.parse(values.get(key)), raw: () => values.get(key), writes: () => writes, fail: () => { fail = true; } };
}
const state = a => ({ answers: {}, status: a.status, questionIndex: a.questionIndex, deadline: a.deadline, elapsedSeconds: a.elapsedSeconds, timedOut: a.timedOut, fontSize: a.fontSize });
function controlledClock(initial = Date.parse("2026-10-16T00:00:00Z")) {
  let now = initial;
  class Clock extends Date { static now() { return now; } }
  return { Clock, tick: milliseconds => { now += milliseconds; return now; } };
}

test("random practice URLs preserve the saved seed and restarting creates independent records", () => {
  const year = `random-${"a".repeat(32)}`, randomPaper = { ...paper, id: `N2-${year}-vocabulary`, year, periodLabel: "随机练习" };
  const s = store(), first = s.api.createStudyAttempt(randomPaper, "practice").attempt;
  assert.equal(s.api.isStudyData(s.read()), true);
  assert.equal(first.type, "vocabulary");
  const url = new URL(s.api.studyAttemptUrl(first), "https://test.local");
  assert.equal(url.searchParams.get("year"), year);
  assert.equal(url.searchParams.get("attempt"), first.id);
  assert.equal(url.searchParams.has("fresh"), false);
  const nextYear = `random-${"b".repeat(32)}`;
  s.api.createStudyAttempt({ ...randomPaper, id: `N2-${nextYear}-vocabulary`, year: nextYear }, "practice");
  assert.equal(s.read().attempts.length, 2);
  assert.equal(s.read().attempts[0].year, year);
  assert.equal(s.read().attempts[1].year, nextYear);
});

test("submission timestamps are assigned once, drafts remain untimed and navigation preserves locked answers", () => {
  const clock = controlledClock(), s = store(undefined, clock.Clock);
  const a = s.api.createStudyAttempt(paper, "practice").attempt;
  clock.tick(1000);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "B", submitted: false, submittedAt: 1 } } }).ok, true);
  assert.equal(Object.hasOwn(s.read().attempts[0].answers.one, "submittedAt"), false);

  const submittedAt = clock.tick(1000);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "B", submitted: true, submittedAt: 1 } } }).ok, true);
  assert.equal(s.read().attempts[0].answers.one.submittedAt, submittedAt);
  const navigatedAt = clock.tick(60_000);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), questionIndex: 1, answers: { one: { selectedOptionId: "B", submitted: true }, two: { selectedOptionId: "A", submitted: false } } }).ok, true);
  const navigated = s.read().attempts[0];
  assert.equal(navigated.updatedAt, navigatedAt);
  assert.equal(navigated.answers.one.submittedAt, submittedAt);
  assert.equal(Object.hasOwn(navigated.answers.two, "submittedAt"), false);

  clock.tick(1000);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "B", submitted: true, submittedAt: navigatedAt } } }).ok, true);
  assert.equal(s.read().attempts[0].answers.one.submittedAt, submittedAt);
  const locked = s.raw();
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, false);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "B", submitted: false } } }).ok, false);
  assert.equal(s.raw(), locked);

  const finishedAt = clock.tick(1000);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), status: "completed", answers: { one: { selectedOptionId: "B", submitted: true }, two: { selectedOptionId: "A", submitted: true } } }).ok, true);
  const completed = s.read().attempts[0];
  assert.equal(completed.answers.one.submittedAt, submittedAt);
  assert.equal(completed.answers.two.submittedAt, finishedAt);
  assert.equal(completed.completedAt, finishedAt);
  const bytes = s.raw(), writes = s.writes();
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(completed), answers: { one: { selectedOptionId: "B", submitted: true, submittedAt: 1 }, two: { selectedOptionId: "A", submitted: true } } }).ok, true);
  assert.equal(s.raw(), bytes);
  assert.equal(s.writes(), writes);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(completed), answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, false);
  assert.equal(s.raw(), bytes);
});

test("exam answers receive timestamps at hand-in and an active exam cannot submit early", () => {
  const clock = controlledClock(), s = store(undefined, clock.Clock);
  const a = s.api.createStudyAttempt(paper, "exam").attempt;
  const deadline = a.createdAt + 60_000;
  clock.tick(1000);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), status: "active", deadline, answers: { one: { selectedOptionId: "A", submitted: false, submittedAt: a.createdAt } } }).ok, true);
  assert.equal(Object.hasOwn(s.read().attempts[0].answers.one, "submittedAt"), false);
  const before = s.raw();
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), status: "active", deadline, answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, false);
  assert.equal(s.raw(), before);
  const handInAt = clock.tick(30_000);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), status: "completed", deadline: null, answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, true);
  const completed = s.read().attempts[0];
  assert.equal(completed.answers.one.submittedAt, handInAt);
  assert.equal(completed.completedAt, handInAt);
  assert.equal(completed.answers.two, undefined);
  assert.equal(s.api.studyScore(completed).unanswered, 1);
});

test("legacy submitted answers remain readable and untimed without rewriting original bytes", () => {
  const clock = controlledClock(), source = store(undefined, clock.Clock);
  const a = source.api.createStudyAttempt(paper, "practice").attempt;
  clock.tick(1000);
  assert.equal(source.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, true);
  const legacy = source.read();
  delete legacy.attempts[0].answers.one.submittedAt;
  const bytes = JSON.stringify(legacy, null, 2);
  const restored = store(bytes, clock.Clock);
  assert.equal(restored.api.readStudySnapshot().error, null);
  assert.equal(restored.api.isStudyData(legacy), true);
  assert.equal(Object.hasOwn(restored.api.readStudySnapshot().data.attempts[0].answers.one, "submittedAt"), false);
  assert.equal(restored.raw(), bytes);
  assert.equal(restored.writes(), 0);
  clock.tick(60_000);
  assert.equal(restored.api.updateStudyAttempt(a.id, { ...state(a), questionIndex: 1, answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, true);
  assert.equal(Object.hasOwn(restored.read().attempts[0].answers.one, "submittedAt"), false);
});

test("submission timestamp validation enforces integer bounds and rejects timestamped drafts", () => {
  const clock = controlledClock(), s = store(undefined, clock.Clock);
  const a = s.api.createStudyAttempt(paper, "practice").attempt;
  clock.tick(1000);
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), answers: { one: { selectedOptionId: "A", submitted: true } } }).ok, true);
  const valid = s.read(), record = valid.attempts[0];
  for (const value of [record.createdAt, record.updatedAt]) {
    const incoming = structuredClone(valid);
    incoming.attempts[0].answers.one.submittedAt = value;
    assert.equal(s.api.isStudyData(incoming), true);
  }
  const before = s.raw();
  for (const value of [record.createdAt - 1, record.updatedAt + 1, 0, -1, 1.5, NaN, Infinity, "2026-10-16", null]) {
    const incoming = structuredClone(valid);
    incoming.attempts[0].answers.one.submittedAt = value;
    assert.equal(s.api.isStudyData(incoming), false, `invalid timestamp ${String(value)}`);
    assert.equal(s.api.importStudyData(incoming).ok, false);
    assert.equal(s.raw(), before);
  }
  const draft = structuredClone(valid);
  draft.attempts[0].answers.one.submitted = false;
  assert.equal(s.api.isStudyData(draft), false);
  assert.equal(s.api.importStudyData(draft).ok, false);
  assert.equal(s.raw(), before);
});

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

test("legacy records remain valid and mobile font preferences are saved independently", () => {
  const s = store(), a = s.api.createStudyAttempt(paper, "practice").attempt;
  assert.equal(a.fontSize, 18); assert.equal(a.mobileFontSize, 16);
  const legacy = s.read(); delete legacy.attempts[0].mobileFontSize;
  const restored = store(legacy);
  assert.equal(restored.api.isStudyData(legacy), true);
  assert.equal(restored.api.updateStudyAttempt(a.id, { ...state(a), fontSize: 24, mobileFontSize: 20 }).ok, true);
  const saved = restored.read().attempts[0];
  assert.equal(saved.fontSize, 24); assert.equal(saved.mobileFontSize, 20);
  const raw = restored.raw();
  assert.equal(restored.api.updateStudyAttempt(a.id, { ...state(saved), mobileFontSize: 5 }).ok, false);
  assert.equal(restored.raw(), raw);
});

test("history cannot delete individual records; clear-all resets scores, trails and activity days", () => {
  const s = store(), first = s.api.createStudyAttempt(paper, "practice").attempt;
  s.api.updateStudyAttempt(first.id, { ...state(first), status: "completed", answers: { one: { selectedOptionId: "A", submitted: true }, two: { selectedOptionId: "B", submitted: true } } });
  s.api.createStudyAttempt(paper, "practice");
  const raw = s.raw();
  for (const attemptId of [first.id, "missing", "", undefined]) {
    assert.equal(s.api.deleteStudyHistory(attemptId).ok, false);
    assert.equal(s.raw(), raw);
  }
  assert.equal(s.api.studySummary(s.read()).completed, 1);
  assert.equal(s.api.questionTrails(s.read()).size, 2);
  assert.equal(s.api.deleteStudyHistory(null).ok, true);
  assert.deepEqual(s.read(), { version: 1, attempts: [], activityDays: [] });
  assert.equal(s.api.studySummary(s.read()).completed, 0);
  assert.equal(s.api.questionTrails(s.read()).size, 0);
  assert.equal(s.api.updateStudyAttempt(first.id, state(first)).ok, false);
});
test("deletion rejects changed or corrupt local data and preserves bytes on storage failure", () => {
  const s = store();
  s.api.createStudyAttempt(paper, "practice");
  const before = s.read();
  s.api.createStudyAttempt(paper, "practice");
  const raw = s.raw();
  assert.equal(s.api.deleteStudyHistory(null, before).ok, false);
  assert.equal(s.raw(), raw);
  s.fail();
  assert.equal(s.api.deleteStudyHistory(null).ok, false);
  assert.equal(s.raw(), raw);
  const corrupt = store("{broken");
  assert.equal(corrupt.api.deleteStudyHistory(null).ok, false);
  assert.equal(corrupt.raw(), "{broken");
});

test("stored scores use category weights, preserve raw accuracy and never grade drafts", () => {
  const make = (category, count) => Array.from({ length: count }, (_, index) => ({ id: `${category}-${index}`, level: "N2", category, correctOptionId: "A", options: [{ id: "A" }, { id: "B" }] }));
  const full = { ...paper, id: "N2-2026-all", typeLabel: "整卷练习", questions: [...make("词汇", 30), ...make("语法", 21), ...make("阅读", 18), ...make("听力", 30)] };
  const s = store(), a = s.api.createStudyAttempt(full, "practice").attempt;
  const answers = Object.fromEntries(full.questions.map((q, index) => [q.id, { selectedOptionId: index < 89 ? "A" : "B", submitted: true }]));
  assert.equal(s.api.updateStudyAttempt(a.id, { ...state(a), status: "completed", answers }).ok, true);
  const raw = s.raw(), score = store(s.read()).api.studyScore(s.read().attempts[0]);
  assert.equal(score.score, 160); assert.equal(score.maxScore, 180); assert.equal(score.percent, 90);
  assert.equal(s.raw(), raw);
  const exam = s.api.createStudyAttempt(full, "exam").attempt;
  s.api.updateStudyAttempt(exam.id, { ...state(exam), status: "active", deadline: Date.now() + 60000, answers: { [full.questions[0].id]: { selectedOptionId: "A", submitted: false } } });
  const draft = s.api.studyScore(s.read().attempts.find(x => x.id === exam.id));
  assert.equal(draft.score, 0); assert.equal(draft.answered, 0); assert.equal(draft.unanswered, full.questions.length);
  const single = s.api.createStudyAttempt(paper, "practice").attempt;
  assert.equal(s.api.studyScore(single).maxScore, 30);
  const collection = s.api.createStudyAttempt({ ...full, id: "favorites-practice", source: "favorites" }, "practice").attempt;
  assert.equal(s.api.studyScore(collection).maxScore, 180);
});

test("completed legacy and cloud-imported snapshots recalculate category scores without rewriting saved bytes", () => {
  const original = store(), attempt = original.api.createStudyAttempt(paper, "practice").attempt;
  assert.equal(original.api.updateStudyAttempt(attempt.id, { ...state(attempt), status: "completed", answers: { one: { selectedOptionId: "A", submitted: true }, two: { selectedOptionId: "B", submitted: true } } }).ok, true);
  const legacy = original.read();
  delete legacy.attempts[0].mobileFontSize;
  const bytes = JSON.stringify(legacy, null, 2);
  const restored = store(bytes), saved = restored.api.readStudySnapshot().data.attempts[0];
  const snapshotBytes = JSON.stringify(saved), score = restored.api.studyScore(saved);
  assert.equal(score.score, 15);
  assert.equal(score.maxScore, 30);
  assert.equal(score.percent, 50);
  assert.equal(score.correct, 1);
  assert.equal(saved.questions[0].correctOptionId, "A");
  assert.equal(JSON.stringify(saved), snapshotBytes);
  assert.equal(restored.raw(), bytes);
  assert.equal(restored.writes(), 0);

  // A new bank answer key must not replace the answers captured by the old attempt.
  const revised = { ...paper, questions: paper.questions.map(question => ({ ...question, correctOptionId: question.id === "one" ? "B" : "A" })) };
  assert.equal(restored.api.matchesStudyPaper(saved, revised, "practice"), false);
  assert.equal(practiceScoring.calculatePracticeScore(revised, { one: "A", two: "B" }).score, 0);
  assert.equal(restored.api.studyScore(saved).score, 15);
  assert.equal(restored.raw(), bytes);

  const imported = store();
  assert.equal(imported.api.importStudyData(legacy).ok, true);
  const importedBytes = imported.raw(), writes = imported.writes();
  const importedScore = imported.api.studyScore(imported.api.readStudySnapshot().data.attempts[0]);
  assert.equal(importedScore.score, score.score);
  assert.equal(importedScore.maxScore, score.maxScore);
  assert.equal(imported.raw(), importedBytes);
  assert.equal(imported.writes(), writes);
});

test("mixed-level favorite snapshots retain category caps and only submitted answers earn points", () => {
  const favorites = {
    ...paper, id: "favorites-practice", source: "favorites", level: "混合", typeLabel: "收藏题练习",
    questions: [
      { ...paper.questions[0], id: "vocabulary", level: "N1" },
      { ...paper.questions[0], id: "grammar", category: "语法", level: "N2" },
      { ...paper.questions[0], id: "reading", category: "阅读", level: "N3" },
      { ...paper.questions[0], id: "listening", category: "听力", level: "N5" },
    ],
  };
  const s = store(), attempt = s.api.createStudyAttempt(favorites, "practice").attempt;
  assert.equal(s.api.updateStudyAttempt(attempt.id, {
    ...state(attempt), answers: {
      vocabulary: { selectedOptionId: "A", submitted: true },
      grammar: { selectedOptionId: "A", submitted: false },
      reading: { selectedOptionId: "B", submitted: true },
      listening: { selectedOptionId: "A", submitted: true },
    },
  }).ok, true);
  const raw = s.raw(), score = s.api.studyScore(s.read().attempts[0]);
  assert.equal(score.score, 90);
  assert.equal(score.maxScore, 180);
  assert.equal(score.answered, 3);
  assert.equal(score.correct, 2);
  assert.equal(score.wrong, 1);
  assert.equal(score.unanswered, 1);
  assert.equal(score.percent, 50);
  assert.deepEqual(JSON.parse(JSON.stringify(score.sections.map(section => [section.score, section.maxScore]))), [[30, 60], [0, 60], [60, 60]]);
  assert.equal(s.raw(), raw);
  for (const [category, maxScore] of [["词汇", 30], ["语法", 30], ["阅读", 60], ["听力", 60]]) {
    const single = s.api.createStudyAttempt({ ...favorites, questions: favorites.questions.filter(question => question.category === category) }, "practice").attempt;
    assert.equal(s.api.studyScore(single).maxScore, maxScore);
  }
});

test("legacy written-only full papers retain 180-point caps and missing category weights are never redistributed", () => {
  const written = {
    ...paper, id: "N2-2026-all", typeLabel: "整套文字练习",
    questions: ["词汇", "语法", "阅读"].map((category, index) => ({ ...paper.questions[0], id: `written-${index}`, category })),
  };
  const s = store(), attempt = s.api.createStudyAttempt(written, "practice").attempt;
  assert.equal(s.api.updateStudyAttempt(attempt.id, { ...state(attempt), status: "completed", answers: Object.fromEntries(written.questions.map(question => [question.id, { selectedOptionId: "A", submitted: true }])) }).ok, true);
  const restored = store(s.raw()), raw = restored.raw(), score = restored.api.studyScore(restored.read().attempts[0]);
  assert.equal(score.score, 120);
  assert.equal(score.maxScore, 180);
  assert.equal(score.percent, 100);
  assert.equal(score.missingSections, true);
  assert.equal(score.sections.find(section => section.id === "listening").available, false);
  assert.equal(restored.raw(), raw);
  assert.equal(restored.writes(), 0);
});
