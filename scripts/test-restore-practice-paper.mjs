import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const exports = {};
const output = ts.transpileModule(fs.readFileSync(new URL("../src/lib/restore-practice-paper.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
// The restore helper must remain independent of browser stores and React.
vm.runInNewContext(output, { exports });
const { restorePracticePaper } = exports;

function fixtures() {
  const questions = Array.from({ length: 99 }, (_, index) => ({ id: `q${index + 1}`, level: "N2", category: index < 30 ? "词汇" : index < 51 ? "语法" : index < 69 ? "阅读" : "听力", prompt: `Question ${index + 1}`, correctOptionId: "A", options: [{ id: "A", text: "first" }, { id: "B", text: "second" }], explanation: ["Explanation"] }));
  const paper = { id: "imported-N2-202412-all", source: "imported", level: "N2", year: "202412", typeLabel: "整卷练习", questions };
  const snapshot = questions => questions.map(question => ({ id: question.id, level: question.level, category: question.category, correctOptionId: question.correctOptionId, optionIds: question.options.map(option => option.id) }));
  const attempt = { id: "old-attempt", paperId: paper.id, source: paper.source, level: paper.level, year: paper.year, type: "all", typeLabel: "整套文字练习", mode: "exam", createdAt: 1, updatedAt: 2, completedAt: null, questions: snapshot(questions.slice(0, 69)), answers: { q1: { selectedOptionId: "A", submitted: false } }, status: "active", questionIndex: 32, deadline: 1800000000000, elapsedSeconds: 30, timedOut: false, fontSize: 18 };
  return { paper, attempt, snapshot };
}

function imageFixtures() {
  const base = fixtures();
  const imageQuestions = [70, 71].map(number => ({ ...base.paper.questions[68], id: `image-q${number}`, media: { images: ["pic/220241270.jpg"] } }));
  const paper = { ...base.paper, questions: [...base.paper.questions.slice(0, 69), ...imageQuestions, ...base.paper.questions.slice(69)] };
  return { ...base, paper, previousPaper: base.paper, imageQuestions };
}

test("an exact snapshot returns the original paper reference", () => {
  const { paper, attempt, snapshot } = fixtures();
  assert.equal(restorePracticePaper(paper, { ...attempt, questions: snapshot(paper.questions) }, "exam"), paper);
  const favorites = { ...paper, id: "favorites-paper", source: "favorites" };
  assert.equal(restorePracticePaper(favorites, { ...attempt, paperId: favorites.id, source: "favorites", questions: snapshot(favorites.questions) }, "exam"), favorites);
});

test("exact snapshots reject scoring metadata changes even when answer keys match", () => {
  const { paper, attempt, snapshot } = fixtures();
  const exact = { ...attempt, questions: snapshot(paper.questions) };
  for (const patch of [{ source: "original" }, { source: "favorites" }, { level: "N1" }, { year: "202407" }, { type: "reading" }, { type: "listening" }]) {
    assert.equal(restorePracticePaper(paper, { ...exact, ...patch }, "exam"), null, JSON.stringify(patch));
  }
  for (const patch of [{ category: "阅读" }, { level: "N1" }]) {
    assert.equal(restorePracticePaper(paper, { ...exact, questions: [{ ...exact.questions[0], ...patch }, ...exact.questions.slice(1)] }, "exam"), null, JSON.stringify(patch));
  }
});

test("exact original snapshots support an implicit original source and enforce the selected type", () => {
  const { paper, attempt, snapshot } = fixtures();
  const original = { ...paper, id: "N2-2026-vocabulary", source: undefined, year: "2026", questions: paper.questions.slice(0, 30) };
  const saved = { ...attempt, paperId: original.id, source: "original", year: original.year, type: "vocabulary", questions: snapshot(original.questions) };
  assert.equal(restorePracticePaper(original, saved, "exam"), original);
  assert.equal(restorePracticePaper(original, { ...saved, type: "all" }, "exam"), null);
});

test("exact favorite snapshots restore mixed levels without requiring a type suffix", () => {
  const { paper, attempt, snapshot } = fixtures();
  const favorites = { ...paper, id: "favorites-practice", source: "favorites", year: "favorites", level: "混合", questions: [paper.questions[0], { ...paper.questions[70], level: "N1" }] };
  const saved = { ...attempt, paperId: favorites.id, source: "favorites", year: favorites.year, level: favorites.level, type: "all", questions: snapshot(favorites.questions) };
  assert.equal(restorePracticePaper(favorites, saved, "exam"), favorites);
  assert.equal(restorePracticePaper(favorites, { ...saved, type: "listening" }, "exam"), favorites);
  assert.equal(restorePracticePaper(favorites, { ...saved, level: "N2" }, "exam"), null);
  assert.equal(restorePracticePaper(favorites, { ...saved, year: "202412" }, "exam"), null);
});

test("a complete legacy 69-question snapshot restores the written subset of a 99-question paper", () => {
  const { paper, attempt } = fixtures();
  const saved = JSON.stringify(attempt), current = JSON.stringify(paper);
  const restored = restorePracticePaper(paper, attempt, "exam");
  assert.equal(restored.questions.length, 69);
  assert.equal(restored.typeLabel, "整套文字练习");
  assert.equal(restored.id, paper.id);
  assert.equal(restored.questions.every((question, index) => question === paper.questions[index]), true);
  assert.equal(restored.questions.some(question => question.category === "听力"), false);
  assert.equal(JSON.stringify(attempt), saved);
  assert.equal(JSON.stringify(paper), current);
  assert.equal(attempt.deadline, 1800000000000);
});

test("legacy restoration rejects changed correct answers, option IDs, category, level, or question IDs", () => {
  const { paper, attempt } = fixtures();
  for (const patch of [{ correctOptionId: "B" }, { optionIds: ["B", "A"] }, { optionIds: ["A", "B", "C"] }, { category: "语法" }, { level: "N1" }, { id: "replacement" }]) {
    assert.equal(restorePracticePaper(paper, { ...attempt, questions: [{ ...attempt.questions[0], ...patch }, ...attempt.questions.slice(1)] }, "exam"), null, JSON.stringify(patch));
  }
});

test("legacy restoration rejects reordered, truncated, or arbitrary question subsets", () => {
  const { paper, attempt } = fixtures();
  for (const questions of [[...attempt.questions].reverse(), attempt.questions.slice(1), attempt.questions.slice(0, 3), [attempt.questions[0], attempt.questions[2]], []]) {
    assert.equal(restorePracticePaper(paper, { ...attempt, questions }, "exam"), null);
  }
  assert.equal(restorePracticePaper({ ...paper, questions: [paper.questions[1], paper.questions[0], ...paper.questions.slice(2)] }, attempt, "exam"), null);
});

test("a genuine written question addition, removal, or replacement cannot use the legacy fallback", () => {
  const { paper, attempt } = fixtures();
  const extra = { ...paper.questions[0], id: "new-written-question" };
  assert.equal(restorePracticePaper({ ...paper, questions: [...paper.questions, extra] }, attempt, "exam"), null);
  assert.equal(restorePracticePaper({ ...paper, questions: paper.questions.slice(1) }, attempt, "exam"), null);
  assert.equal(restorePracticePaper({ ...paper, questions: [extra, ...paper.questions.slice(1)] }, attempt, "exam"), null);
});

test("fallback is limited to the same normal full paper, source, level, year, and mode", () => {
  const { paper, attempt } = fixtures();
  for (const patch of [{ paperId: "other-paper" }, { mode: "practice" }, { source: "original" }, { source: "favorites" }, { level: "N1" }, { year: "202407" }, { type: "reading" }]) {
    assert.equal(restorePracticePaper(paper, { ...attempt, ...patch }, "exam"), null, JSON.stringify(patch));
  }
  const reading = { ...paper, id: "imported-N2-202412-reading" };
  assert.equal(restorePracticePaper(reading, { ...attempt, paperId: reading.id }, "exam"), null);
  assert.equal(restorePracticePaper({ ...paper, source: "favorites" }, attempt, "exam"), null);
});

test("partially saved listening papers and other written-only papers cannot use the fallback", () => {
  const { paper, attempt, snapshot } = fixtures();
  assert.equal(restorePracticePaper(paper, { ...attempt, questions: snapshot(paper.questions.slice(0, 70)) }, "exam"), null);
  assert.equal(restorePracticePaper({ ...paper, questions: paper.questions.slice(0, 68) }, attempt, "exam"), null);
});

test("new full and reading snapshots retain all remote image questions", () => {
  const { paper, attempt, snapshot } = imageFixtures();
  assert.equal(paper.questions.length, 101);
  assert.equal(restorePracticePaper(paper, { ...attempt, questions: snapshot(paper.questions) }, "exam"), paper);
  const reading = { ...paper, id: "imported-N2-202412-reading", questions: paper.questions.filter(question => question.category === "阅读") };
  const saved = { ...attempt, paperId: reading.id, type: "reading", questions: snapshot(reading.questions) };
  assert.equal(reading.questions.length, 20);
  assert.equal(restorePracticePaper(reading, saved, "exam"), reading);
});

test("previous 99-question full papers restore after two remote image questions are added", () => {
  const { paper, previousPaper, attempt, snapshot } = imageFixtures();
  const saved = { ...attempt, questions: snapshot(previousPaper.questions), typeLabel: "整卷练习" };
  const before = JSON.stringify(saved);
  const restored = restorePracticePaper(paper, saved, "exam");
  assert.equal(restored.questions.length, 99);
  assert.equal(restored.questions.map(question => question.id).join(), previousPaper.questions.map(question => question.id).join());
  assert.equal(restored.questions.filter(question => question.category === "听力").length, 30);
  assert.equal(JSON.stringify(saved), before);
});

test("previous 18-question reading papers restore after two remote image questions are added", () => {
  const { paper, previousPaper, attempt, snapshot } = imageFixtures();
  const reading = { ...paper, id: "imported-N2-202412-reading", questions: paper.questions.filter(question => question.category === "阅读") };
  const saved = { ...attempt, paperId: reading.id, type: "reading", typeLabel: "阅读", questions: snapshot(previousPaper.questions.filter(question => question.category === "阅读")) };
  const restored = restorePracticePaper(reading, saved, "exam");
  assert.equal(restored.questions.length, 18);
  assert.equal(restored.questions.every(question => !question.media?.images.length), true);
  assert.equal(restored.typeLabel, "阅读");
});

test("oldest 69-question written full papers restore after listening and image questions are added", () => {
  const { paper, attempt } = imageFixtures();
  const restored = restorePracticePaper(paper, attempt, "exam");
  assert.equal(restored.questions.length, 69);
  assert.equal(restored.questions.some(question => question.category === "听力" || question.media?.images.length), false);
  assert.equal(restored.typeLabel, "整套文字练习");
  assert.equal(attempt.deadline, 1800000000000);
});

test("remote image compatibility rejects incomplete removals, reordered snapshots and genuine question edits", () => {
  const { paper, previousPaper, imageQuestions, attempt, snapshot } = imageFixtures();
  const previous = snapshot(previousPaper.questions);
  for (const questions of [previous.slice(1), previous.slice(0, -1), [...previous].reverse(), [...previous.slice(0, 69), ...snapshot(imageQuestions.slice(0, 1)), ...previous.slice(69)]]) {
    assert.equal(restorePracticePaper(paper, { ...attempt, questions }, "exam"), null);
  }
  for (const patch of [{ id: "changed" }, { correctOptionId: "B" }, { category: "语法" }, { level: "N1" }, { optionIds: ["B", "A"] }]) {
    assert.equal(restorePracticePaper(paper, { ...attempt, questions: [{ ...previous[0], ...patch }, ...previous.slice(1)] }, "exam"), null, JSON.stringify(patch));
  }
});

test("remote image compatibility cannot remove non-reading or local image questions", () => {
  const { paper, previousPaper, imageQuestions, attempt, snapshot } = imageFixtures();
  const saved = { ...attempt, questions: snapshot(previousPaper.questions) };
  for (const image of [{ ...imageQuestions[0], category: "语法" }, { ...imageQuestions[0], media: { images: ["/imported-media/pic/local.jpg"] } }]) {
    const changed = { ...paper, questions: [...previousPaper.questions.slice(0, 69), image, ...previousPaper.questions.slice(69)] };
    assert.equal(restorePracticePaper(changed, saved, "exam"), null);
  }
});

test("favorite image snapshots still require exact questions instead of legacy filtering", () => {
  const { paper, previousPaper, attempt, snapshot } = imageFixtures();
  const favorites = { ...paper, id: "favorites-practice", source: "favorites", year: "favorites" };
  const saved = { ...attempt, paperId: favorites.id, source: "favorites", year: favorites.year, questions: snapshot(previousPaper.questions) };
  assert.equal(restorePracticePaper(favorites, saved, "exam"), null);
  assert.equal(restorePracticePaper(favorites, { ...saved, questions: snapshot(favorites.questions) }, "exam"), favorites);
});
