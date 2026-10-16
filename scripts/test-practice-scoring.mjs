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

test("single-category practice gives vocabulary and grammar 30 points each and reading and listening 60 each", () => {
  for (const level of ["N1", "N2", "N3", "N4", "N5", "混合"]) for (const [category, maxScore] of [["词汇", 30], ["语法", 30], ["阅读", 60], ["听力", 60]]) {
    const items = questions(category, 6);
    const result = calculatePracticeScore({ level, questions: items }, answer(items, 5));
    assert.equal(result.score, maxScore === 30 ? 25 : 50);
    assert.equal(result.maxScore, maxScore);
    assert.equal(result.percent, 83);
    assert.equal(result.correct, 5);
    assert.equal(result.unanswered, 1);
    assert.equal(result.sections.length, 1);
    assert.equal(result.missingSections, false);
  }
});

test("every level uses language knowledge 60, reading 60 and listening 60 despite unequal question counts", () => {
  const vocabulary = questions("词汇", 3), grammar = questions("语法", 1);
  const reading = questions("阅读", 2), listening = questions("听力", 10);
  const items = [...vocabulary, ...grammar, ...reading, ...listening];
  const answers = { ...answer(vocabulary), ...answer(grammar), ...answer(reading, 1), ...answer(listening, 0) };
  for (const level of ["N1", "N2", "N3", "N4", "N5", "混合"]) {
    const result = calculatePracticeScore({ level, fullPaper: true, questions: items }, answers);
    assert.equal(result.score, 90);
    assert.equal(result.maxScore, 180);
    assert.equal(result.percent, 31);
    assert.deepEqual(plain(result.sections.map(section => [section.id, section.maxScore])), [["language-knowledge", 60], ["reading", 60], ["listening", 60]]);
    assert.deepEqual(plain(result.sections.map(section => section.score)), [60, 30, 0]);
    assert.equal(result.missingSections, false);
  }
});

test("vocabulary and grammar keep their own weights when their question counts differ", () => {
  const vocabulary = questions("词汇", 30), grammar = questions("语法", 21);
  const reading = questions("阅读", 4), listening = questions("听力", 10);
  const answers = { ...answer(vocabulary), ...answer(grammar, grammar.length, "B"), ...answer(reading), ...answer(listening) };
  const vocabularyScore = calculatePracticeScore({ level: "N2", questions: vocabulary }, answers);
  const grammarScore = calculatePracticeScore({ level: "N2", questions: grammar }, answers);
  const combined = calculatePracticeScore({ level: "N2", questions: [...vocabulary, ...grammar] }, answers);
  const full = calculatePracticeScore({ level: "N2", fullPaper: true, questions: [...vocabulary, ...grammar, ...reading, ...listening] }, answers);
  assert.equal(vocabularyScore.score, 30);
  assert.equal(grammarScore.score, 0);
  assert.equal(combined.score, vocabularyScore.score + grammarScore.score);
  assert.equal(combined.maxScore, 60);
  assert.equal(combined.sections.length, 1);
  assert.equal(full.sections[0].score, combined.score);
  assert.equal(full.score, 150);
});

test("rounding happens within each category so separately practiced scores add to the full-paper score", () => {
  const vocabulary = questions("词汇", 3), grammar = questions("语法", 4);
  const reading = questions("阅读", 7), listening = questions("听力", 9);
  const groups = [vocabulary, grammar, reading, listening];
  const answers = { ...answer(vocabulary, 1), ...answer(grammar, 1), ...answer(reading, 2), ...answer(listening, 4) };
  const singles = groups.map(items => calculatePracticeScore({ level: "N3", questions: items }, answers));
  const full = calculatePracticeScore({ level: "N3", fullPaper: true, questions: groups.flat() }, answers);
  assert.deepEqual(singles.map(result => result.score), [10, 8, 17, 27]);
  assert.deepEqual(plain(full.sections.map(section => section.score)), [18, 17, 27]);
  assert.equal(full.score, singles.reduce((sum, result) => sum + result.score, 0));
  assert.equal(full.score, 62);
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

test("missing full-paper categories retain their full weight and receive zero", () => {
  const language = questions("语法", 5), reading = questions("阅读", 2);
  for (const level of ["N1", "N2", "N3", "N4", "N5"]) {
    const result = calculatePracticeScore({ level, fullPaper: true, questions: [...language, ...reading] }, { ...answer(language), ...answer(reading) });
    assert.equal(result.score, 90);
    assert.equal(result.maxScore, 180);
    assert.equal(result.percent, 100);
    assert.equal(result.missingSections, true);
    assert.equal(result.sections[0].score, 30);
    assert.equal(result.sections[0].maxScore, 60);
    const missing = result.sections.find(section => section.id === "listening");
    assert.deepEqual(plain(missing), { id: "listening", label: "听力", score: 0, maxScore: 60, correct: 0, total: 0, available: false });
  }
});

test("a missing vocabulary or grammar subtype marks a full paper incomplete even if all three report sections have questions", () => {
  for (const absent of ["词汇", "语法"]) {
    const items = ["词汇", "语法", "阅读", "听力"].filter(category => category !== absent).flatMap(category => questions(category, 3));
    const result = calculatePracticeScore({ level: "N2", fullPaper: true, questions: items }, answer(items));
    assert.equal(result.score, 150);
    assert.equal(result.maxScore, 180);
    assert.equal(result.sections.every(section => section.available), true);
    assert.equal(result.sections[0].score, 30);
    assert.equal(result.missingSections, true);
  }
});

test("mixed-category and mixed-level practices use the sum of the categories they actually contain", () => {
  for (const level of ["N2", "混合"]) for (const [categories, maxScore] of [
    [["词汇", "语法"], 60],
    [["阅读", "听力"], 120],
    [["词汇", "阅读"], 90],
    [["词汇", "语法", "阅读", "听力"], 180],
  ]) {
    const items = categories.flatMap(category => questions(category, 3));
    const result = calculatePracticeScore({ level, questions: items }, answer(items));
    assert.equal(result.score, maxScore);
    assert.equal(result.maxScore, maxScore);
    assert.equal(result.correct, items.length);
    assert.equal(result.missingSections, false);
    assert.equal(result.sections.reduce((sum, section) => sum + section.maxScore, 0), maxScore);
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
    assert.equal(result.maxScore, fullPaper ? 180 : 0);
    assert.equal(result.percent, 0);
    assert.equal(result.total, 0);
    assert.equal(result.unanswered, 0);
    assert.equal(result.missingSections, true);
    assert.equal(result.sections.length, fullPaper ? 3 : 0);
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
  assert.equal(calculatePracticeScore(paper, answers).score, 20);
  assert.equal(items.length, 3);
  assert.deepEqual(answers, { "语法-0": "A", "语法-1": "A" });
});
