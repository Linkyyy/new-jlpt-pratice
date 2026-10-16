import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/lib/study-insights.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: api, Date });

const DAY = 86_400_000;
const time = value => Date.parse(value);
const now = time("2026-10-16T12:00:00+09:00");
function question(id, category = "词汇", correctOptionId = "A") {
  return { id, level: "N2", category, correctOptionId, optionIds: ["A", "B", "C", "D"] };
}
function attempt(id, timestamp, answers, overrides = {}) {
  return {
    id, paperId: "paper", source: "original", level: "N2", year: "2026", type: "all", typeLabel: "整卷", periodLabel: "2026年", mode: "practice",
    createdAt: timestamp, updatedAt: timestamp, completedAt: null,
    questions: Object.keys(answers).map(id => question(id)),
    answers: Object.fromEntries(Object.entries(answers).map(([id, selectedOptionId]) => [id, { selectedOptionId, submitted: true }])),
    status: "active", questionIndex: 0, deadline: null, elapsedSeconds: 0, timedOut: false, fontSize: 18,
    ...overrides,
  };
}
const data = (attempts = [], activityDays = []) => ({ version: 1, attempts, activityDays });
const plain = value => JSON.parse(JSON.stringify(value));

test("counts only submitted answers; unfinished exams never reveal graded results", () => {
  const draft = attempt("draft", now, { q: "B", chosen: "B" });
  draft.answers.chosen.submitted = false;
  const exam = attempt("exam", now, { q: "B", secret: "A" }, { mode: "exam", status: "active" });
  const ready = attempt("ready", now, { secret: "A" }, { mode: "exam", status: "ready" });
  const insights = api.buildQuestionInsights(data([draft, exam, ready]), now);
  assert.equal(insights.size, 1);
  assert.equal(insights.get("q").answeredCount, 1);
  assert.equal(insights.get("q").wrongCount, 1);
  assert.equal(api.getStudyWeeklyReport(data([draft, exam, ready]), now).current.answered, 1);
});

test("history is chronological, wrong counts persist, and saved answer keys remain authoritative", () => {
  const first = attempt("first", now - 8 * DAY, { q: "B" });
  const second = attempt("second", now - 7 * DAY, { q: "B" }, { questions: [question("q", "语法", "B")] });
  const third = attempt("third", now - DAY, { q: "B" });
  const input = data([third, first, second]);
  const bytes = JSON.stringify(input);
  const insight = api.buildQuestionInsights(input, now).get("q");
  assert.equal(insight.answeredCount, 3);
  assert.equal(insight.wrongCount, 2);
  assert.equal(insight.correctCount, 1);
  assert.equal(insight.lastCorrect, false);
  assert.equal(insight.lastAnsweredAt, now - DAY);
  assert.equal(insight.consecutiveCorrect, 0);
  assert.equal(insight.category, "词汇");
  assert.equal(insight.dueAt, now);
  assert.equal(insight.reviewStatus, "due");
  assert.equal(JSON.stringify(input), bytes);
});

test("spaced review expands after correct answers and resets to one day after a mistake", () => {
  const sessions = [attempt("wrong", now - DAY, { q: "B" })];
  for (const [index, days] of [3, 7, 14, 30, 60, 60].entries()) {
    sessions.push(attempt(`correct-${index}`, now + index * DAY, { q: "A" }));
    const insight = api.buildQuestionInsights(data(sessions), now + index * DAY).get("q");
    assert.equal(insight.consecutiveCorrect, index + 1);
    assert.equal(insight.dueAt, now + (index + days) * DAY);
    assert.equal(insight.reviewStatus, index >= 2 ? "mastered" : "scheduled");
    assert.equal(insight.wrongCount, 1);
  }
  sessions.push(attempt("wrong-again", now + 7 * DAY, { q: "B" }));
  const reset = api.buildQuestionInsights(data(sessions), now + 7 * DAY).get("q");
  assert.equal(reset.dueAt, now + 8 * DAY);
  assert.equal(reset.consecutiveCorrect, 0);
  assert.equal(reset.wrongCount, 2);
});

test("due queue contains historical mistakes only and prioritizes overdue then frequent mistakes", () => {
  const history = data([
    attempt("first", now - 4 * DAY, { earlier: "B", frequent: "B", correctOnly: "A", tied: "B" }),
    attempt("second", now - 3 * DAY, { frequent: "B", tied: "B" }),
    attempt("third", now - 3 * DAY, { frequent: "B" }),
    attempt("recent", now, { fresh: "B" }),
  ]);
  assert.deepEqual(plain(api.getDueReviewQuestionIds(history, now)), ["earlier", "frequent", "tied"]);
  const due = api.buildQuestionInsights(history, now);
  assert.equal(due.get("correctOnly").reviewStatus, "due");
  assert.equal(due.get("fresh").reviewStatus, "scheduled");
});

test("completed exam uses completion time, excludes blanks, and future snapshots are excluded", () => {
  const exam = attempt("exam", now - DAY, { q: "A" }, {
    questions: [question("q"), question("blank")], mode: "exam", status: "completed", completedAt: now,
  });
  const future = attempt("future", now + 1, { q: "B" });
  const insights = api.buildQuestionInsights(data([future, exam]), now);
  assert.equal(insights.size, 1);
  assert.equal(insights.get("q").lastAnsweredAt, now);
  assert.equal(insights.get("q").wrongCount, 0);
  assert.equal(api.getStudyWeeklyReport(data([future, exam]), now).current.completed, 1);
});

test("weekly boundaries use Monday midnight in JST, not UTC or the browser timezone", () => {
  const monday = time("2026-10-11T15:00:00Z");
  const history = data([
    attempt("sunday", monday - 1, { old: "B" }, { status: "completed", completedAt: monday - 1 }),
    attempt("monday", monday, { first: "A" }, { status: "completed", completedAt: monday }),
    attempt("today", now, { second: "A", third: "B" }),
  ], ["2026-10-11", "2026-10-12", "2026-10-16"]);
  const report = api.getStudyWeeklyReport(history, now);
  assert.equal(report.weekStart, monday);
  assert.equal(report.previousWeekStart, monday - 7 * DAY);
  assert.equal(report.weekEnd, now);
  assert.equal(report.current.practiceCount, 2);
  assert.equal(report.current.answered, 3);
  assert.equal(report.current.correct, 2);
  assert.equal(report.current.accuracy, 67);
  assert.equal(report.current.completed, 1);
  assert.equal(report.current.studyDays, 2);
  assert.equal(report.previous.practiceCount, 1);
  assert.equal(report.previous.answered, 1);
  assert.equal(report.previous.completed, 1);
  assert.equal(report.previous.studyDays, 1);
  assert.equal(report.timeBasis, "answer-or-attempt");
});

test("Monday and month/year boundaries exclude last week endpoint from previous metrics", () => {
  const monday = time("2026-01-05T00:00:00+09:00");
  const report = api.getStudyWeeklyReport(data([
    attempt("last-year", time("2025-12-31T20:00:00+09:00"), { old: "A" }),
    attempt("just-now", monday, { q: "A" }),
  ]), monday);
  assert.equal(report.weekStart, monday);
  assert.equal(report.current.answered, 1);
  assert.equal(report.previous.answered, 1);
  assert.equal(report.previousWeekStart, time("2025-12-29T00:00:00+09:00"));
});

test("per-answer times keep multi-day sessions in their real weeks despite later session updates", () => {
  const monday = time("2026-10-12T00:00:00+09:00");
  const oldTime = monday - 1000;
  const newTime = monday + DAY;
  const session = attempt("cross-week", now, { old: "B", recent: "A", legacy: "A" }, { createdAt: oldTime });
  session.answers.old.submittedAt = oldTime;
  session.answers.recent.submittedAt = newTime;
  const history = data([session]);
  const insights = api.buildQuestionInsights(history, now);
  assert.equal(insights.get("old").lastAnsweredAt, oldTime);
  assert.equal(insights.get("recent").lastAnsweredAt, newTime);
  assert.equal(insights.get("legacy").lastAnsweredAt, now);
  const report = api.getStudyWeeklyReport(history, now);
  assert.equal(report.previous.answered, 1);
  assert.equal(report.previous.practiceCount, 1);
  assert.equal(report.current.answered, 2);
  assert.equal(report.current.practiceCount, 1);
  assert.equal(report.current.studyDays, 2);
});

test("event chronology overrides session creation and update ordering", () => {
  const olderSession = attempt("old", now, { q: "A" }, { createdAt: now - 10 * DAY });
  olderSession.answers.q.submittedAt = now - 3 * DAY;
  const newerSession = attempt("new", now - 2 * DAY, { q: "B" });
  newerSession.answers.q.submittedAt = now - 2 * DAY;
  const futureAnswer = attempt("future-answer", now, { hidden: "A" });
  futureAnswer.answers.hidden.submittedAt = now + 1;
  const insights = api.buildQuestionInsights(data([newerSession, olderSession, futureAnswer]), now);
  assert.equal(insights.size, 1);
  assert.equal(insights.get("q").lastCorrect, false);
  assert.equal(insights.get("q").lastAnsweredAt, now - 2 * DAY);
  assert.equal(insights.get("q").consecutiveCorrect, 0);
});

test("weekly practice and completion metrics distinguish submissions, drafts and empty hand-ins", () => {
  const history = data([
    attempt("submitted", now, { q: "A" }),
    attempt("draft", now, { draft: "B" }, { answers: { draft: { selectedOptionId: "B", submitted: false } } }),
    attempt("empty-exam", now, {}, { mode: "exam", status: "completed", completedAt: now }),
    attempt("active-exam", now, { exam: "A" }, { mode: "exam", status: "active" }),
  ], ["2026-10-14", "2026-10-16", "2026-10-16", "2026-10-17"]);
  const current = api.getStudyWeeklyReport(history, now).current;
  assert.equal(current.practiceCount, 1);
  assert.equal(current.answered, 1);
  assert.equal(current.completed, 1);
  assert.equal(current.studyDays, 2);
});

test("recommendations require enough evidence and prioritize weakest graded categories", () => {
  const history = data([
    attempt("vocabulary", now - 3 * DAY, { v1: "B", v2: "B", v3: "A" }),
    attempt("reading", now - 2 * DAY, { r1: "B", r2: "B", r3: "B" }, { questions: ["r1", "r2", "r3"].map(id => question(id, "阅读")) }),
    attempt("grammar-small", now, { g1: "B" }, { questions: [question("g1", "语法")] }),
    attempt("listening-perfect", now, { l1: "A", l2: "A", l3: "A" }, { questions: ["l1", "l2", "l3"].map(id => question(id, "听力")) }),
  ]);
  const recommendation = api.getStudyRecommendations(history, now);
  assert.equal(recommendation.suggestedCategory, "阅读");
  assert.deepEqual(plain(recommendation.weakCategories.map(category => category.category)), ["阅读", "词汇"]);
  assert.equal(recommendation.wrongQuestionIds.includes("g1"), true);
  assert.equal(recommendation.dueQuestionIds.includes("g1"), false);
  const week = api.getStudyWeeklyReport(history, now);
  assert.equal(week.current.categories.find(category => category.category === "听力").accuracy, 100);
  assert.equal(week.current.categories.find(category => category.category === "阅读").wrong, 3);
});

test("empty records produce zero metrics without mutating input or consulting a global clock", () => {
  const input = Object.freeze({ version: 1, attempts: Object.freeze([]), activityDays: Object.freeze([]) });
  assert.equal(api.buildQuestionInsights(input, now).size, 0);
  assert.deepEqual(plain(api.getDueReviewQuestionIds(input, now)), []);
  const recommendation = api.getStudyRecommendations(input, now);
  assert.equal(recommendation.suggestedCategory, null);
  const report = api.getStudyWeeklyReport(input, now);
  for (const period of [report.current, report.previous]) {
    assert.equal(period.answered, 0); assert.equal(period.correct, 0); assert.equal(period.accuracy, 0);
    assert.equal(period.practiceCount, 0); assert.equal(period.completed, 0); assert.equal(period.studyDays, 0);
  }
  assert.deepEqual(plain(api.getStudyWeeklyReport(input, now)), plain(report));
});
