import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const exports = {};
const source = fs.readFileSync(new URL("../src/lib/practice-scoring.ts", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports });
const { calculatePracticeScore } = exports;
const questions = (category, count) => Array.from({ length: count }, (_, index) => ({
  id: `${category}-${index}`, category, correctOptionId: "A",
}));
const answer = (items, count = items.length, value = "A") => Object.fromEntries(items.slice(0, count).map(question => [question.id, value]));
const plain = value => JSON.parse(JSON.stringify(value));

test("single-section practice reports 50/60 while percent remains raw accuracy", () => {
  for (const level of ["N1", "N2", "N3", "N4", "N5"]) for (const category of ["词汇", "语法", "阅读", "听力"]) {
    const items = questions(category, 6);
    const result = calculatePracticeScore({ level, questions: items }, answer(items, 5));
    assert.equal(result.score, 50);
    assert.equal(result.maxScore, 60);
    assert.equal(result.percent, 83);
    assert.equal(result.correct, 5);
    assert.equal(result.unanswered, 1);
  }
});

test("N1–N3 full papers weight each scoring section equally despite unequal question counts", () => {
  const vocabulary = questions("词汇", 3), grammar = questions("语法", 1);
  const reading = questions("阅读", 2), listening = questions("听力", 10);
  const items = [...vocabulary, ...grammar, ...reading, ...listening];
  const answers = { ...answer(vocabulary), ...answer(grammar), ...answer(reading, 1), ...answer(listening, 0) };
  for (const level of ["N1", "N2", "N3"]) {
    const result = calculatePracticeScore({ level, fullPaper: true, questions: items }, answers);
    assert.equal(result.score, 90);
    assert.equal(result.maxScore, 180);
    assert.equal(result.percent, 31);
    assert.deepEqual(plain(result.sections.map(section => section.score)), [60, 30, 0]);
    assert.equal(result.missingSections, false);
  }
});

test("N4–N5 use a combined 120-point language and reading section plus 60-point listening", () => {
  const vocabulary = questions("词汇", 1), grammar = questions("语法", 1);
  const reading = questions("阅读", 4), listening = questions("听力", 10);
  const items = [...vocabulary, ...grammar, ...reading, ...listening];
  const answers = { ...answer(vocabulary), ...answer(grammar), ...answer(reading, 3), ...answer(listening) };
  for (const level of ["N4", "N5"]) {
    const result = calculatePracticeScore({ level, fullPaper: true, questions: items }, answers);
    assert.equal(result.score, 160);
    assert.equal(result.maxScore, 180);
    assert.deepEqual(plain(result.sections.map(section => [section.maxScore, section.score])), [[120, 100], [60, 60]]);
  }
});

test("a full N2 paper can show 160/180 and preserves raw question counts separately", () => {
  const language = [...questions("词汇", 3), ...questions("语法", 3)];
  const reading = questions("阅读", 6), listening = questions("听力", 6);
  const result = calculatePracticeScore({ level: "N2", fullPaper: true, questions: [...language, ...reading, ...listening] }, {
    ...answer(language, 5), ...answer(reading, 5), ...answer(listening),
  });
  assert.equal(result.score, 160);
  assert.equal(result.maxScore, 180);
  assert.equal(result.correct, 16);
  assert.equal(result.total, 18);
  assert.equal(result.unanswered, 2);
  assert.equal(result.percent, 89);
});

test("missing official scoring sections retain their full weight and receive zero", () => {
  const language = questions("语法", 5), reading = questions("阅读", 2);
  for (const level of ["N1", "N2", "N3", "N4", "N5"]) {
    const result = calculatePracticeScore({ level, fullPaper: true, questions: [...language, ...reading] }, { ...answer(language), ...answer(reading) });
    assert.equal(result.score, 120);
    assert.equal(result.maxScore, 180);
    assert.equal(result.percent, 100);
    assert.equal(result.missingSections, true);
    const missing = result.sections.find(section => section.id === "listening");
    assert.deepEqual(plain(missing), { id: "listening", label: "听力", score: 0, maxScore: 60, correct: 0, total: 0, available: false });
  }
});

test("mixed-category and mixed-level collection practices share one 60-point scale", () => {
  const items = ["词汇", "语法", "阅读", "听力"].flatMap(category => questions(category, 3));
  for (const level of ["N2", "混合"]) for (const fullPaper of level === "混合" ? [false, true] : [false]) {
    const result = calculatePracticeScore({ level, fullPaper, questions: items }, answer(items, 10));
    assert.equal(result.score, 50);
    assert.equal(result.maxScore, 60);
    assert.equal(result.sections.length, 1);
    assert.equal(result.correct, 10);
  }
});

test("blank and wrong answers receive no points and unrelated answer IDs are ignored", () => {
  const items = questions("听力", 5);
  const result = calculatePracticeScore({ level: "N1", questions: items }, { ...answer(items, 2, "B"), unrelated: "A" });
  assert.equal(result.score, 0);
  assert.equal(result.percent, 0);
  assert.equal(result.unanswered, 3);
  assert.equal(result.total, 5);
});

test("empty papers have finite zero scores and preserve the appropriate maximum", () => {
  for (const level of ["N1", "N2", "N3", "N4", "N5", "混合"]) for (const fullPaper of [false, true]) {
    const result = calculatePracticeScore({ level, fullPaper, questions: [] }, {});
    assert.equal(result.score, 0);
    assert.equal(result.maxScore, fullPaper && level !== "混合" ? 180 : 60);
    assert.equal(result.percent, 0);
    assert.equal(result.total, 0);
    assert.equal(result.unanswered, 0);
    assert.equal(result.missingSections, true);
    assert.ok(result.sections.every(section => !section.available));
  }
});

test("section rounding remains integral and bounded, including every level's full-score cap", () => {
  const items = ["词汇", "语法", "阅读", "听力"].flatMap(category => questions(category, 7));
  for (const level of ["N1", "N2", "N3", "N4", "N5"]) for (const count of [0, 1, 8, 17, items.length]) {
    const result = calculatePracticeScore({ level, fullPaper: true, questions: items }, answer(items, count));
    assert.ok(Number.isInteger(result.score));
    assert.ok(result.score >= 0 && result.score <= 180);
    assert.ok(result.sections.every(section => Number.isInteger(section.score) && section.score >= 0 && section.score <= section.maxScore));
    assert.equal(result.score, result.sections.reduce((sum, section) => sum + section.score, 0));
    if (count === items.length) assert.equal(result.score, 180);
  }
});

test("scoring does not mutate frozen papers, question lists, or answer maps", () => {
  const items = Object.freeze(questions("语法", 3).map(Object.freeze));
  const paper = Object.freeze({ level: "N3", fullPaper: false, questions: items });
  const answers = Object.freeze(answer(items, 2));
  assert.equal(calculatePracticeScore(paper, answers).score, 40);
  assert.equal(items.length, 3);
  assert.deepEqual(answers, { "语法-0": "A", "语法-1": "A" });
});
