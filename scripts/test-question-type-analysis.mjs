import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/lib/question-type-analysis.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports, URLSearchParams });
const { analyzeQuestionTypes, suggestedQuestionTypes, questionTypePracticeHref } = exports;
const plain = value => JSON.parse(JSON.stringify(value));
const question = (id, category, instruction, level = "N2") => ({ id, category, instruction, level, correctOptionId: "A" });

test("semantic vocabulary and grammar groups normalize HTML and full-width problem numbers", () => {
  const questions = [
    question("v1", "词汇", "<p>問題１&nbsp;言葉の読み方</p>"),
    question("v2", "词汇", "問題1 言葉の読み方"),
    question("v3", "词汇", "問題2 漢字で書くとき"),
    question("v4", "词汇", "問題5 意味が最も近いもの"),
    question("v5", "词汇", "問題6 言葉の使い方"),
    question("v6", "词汇", "問題3 に入れるのに最もよいもの"),
    question("g1", "语法", "問題7 次の文の( )に入れる"),
    question("g2", "语法", "問題8 次の文の__★__に入る"),
    question("g3", "语法", "問題9 次の文章を読んで"),
  ];
  const groups = analyzeQuestionTypes(questions, { v1: "A", v2: "B", v3: "A" });
  assert.deepEqual(plain(groups.map(group => group.label)), ["汉字读音", "汉字书写", "近义表达", "词语用法", "词汇填空", "语法选择", "语句排序", "文章语法"]);
  assert.deepEqual(plain({ ...groups[0], key: undefined }), {
    label: "汉字读音", category: "词汇", level: "N2", total: 2, correct: 1, wrong: 1, unanswered: 0, percent: 50, firstReviewIndex: 1,
  });
});

test("reading and listening keep their own actual problem numbers and distinguish mixed levels", () => {
  const groups = analyzeQuestionTypes([
    question("r1", "阅读", "問題１０ 次の文章を読んで", "N1"),
    question("r2", "阅读", "問題10 次の文章を読んで", "N2"),
    question("l1", "听力", "問題1 まず質問を聞いてください"),
    question("l2", "听力", "問題2 まず質問を聞いてください"),
  ], { r1: "A", r2: "B" });
  assert.equal(groups.length, 4);
  assert.notEqual(groups[0].key, groups[1].key);
  assert.equal(groups[0].problemNumber, "10");
  assert.equal(groups[2].problemNumber, "1");
  assert.equal(groups[3].problemNumber, "2");
});

test("identical vocabulary fill-in instructions from distinct problems do not hide separate weaknesses", () => {
  const groups = analyzeQuestionTypes([
    question("v3", "词汇", "問題3 ( )に入れるのに最もよいもの"),
    question("v4", "词汇", "問題4 ( )に入れるのに最もよいもの"),
  ], { v3: "A", v4: "B" });
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, "词汇填空");
  assert.equal(groups[0].problemNumber, "3");
  assert.equal(groups[1].problemNumber, "4");
  assert.equal(groups[0].percent, 100);
  assert.equal(groups[1].percent, 0);
});

test("original questions without instructions use a safe category fallback and blanks remain distinct from wrong answers", () => {
  const groups = analyzeQuestionTypes([
    question("a", "语法"), question("b", "语法"), question("c", "语法"),
  ], { a: "A", b: "C", unrelated: "A" });
  assert.equal(groups.length, 1);
  const group = groups[0];
  assert.equal(group.label, "语法");
  assert.equal(group.correct, 1);
  assert.equal(group.wrong, 1);
  assert.equal(group.unanswered, 1);
  assert.equal(group.percent, 33);
  assert.equal(group.firstReviewIndex, 1);
  assert.equal(group.correct + group.wrong + group.unanswered, group.total);
});

test("review target prefers the first wrong answer over an earlier blank", () => {
  const questions = [question("a", "阅读"), question("b", "阅读"), question("c", "阅读")];
  assert.equal(analyzeQuestionTypes(questions, { b: "B", c: "C" })[0].firstReviewIndex, 1);
  assert.equal(analyzeQuestionTypes(questions, { b: "A" })[0].firstReviewIndex, 0);
  assert.equal(analyzeQuestionTypes(questions, { a: "A", b: "A", c: "A" })[0].firstReviewIndex, undefined);
});

test("suggestions select at most two unfinished groups without mutating or suggesting perfect groups", () => {
  const groups = Object.freeze(analyzeQuestionTypes([
    question("v", "词汇"), question("g", "语法"), question("r", "阅读"), question("l", "听力"),
  ], { v: "A", g: "B", r: "C" }).map(Object.freeze));
  assert.deepEqual(plain(suggestedQuestionTypes(groups).map(group => group.category)), ["语法", "阅读"]);
  assert.deepEqual(plain(groups.map(group => group.category)), ["词汇", "语法", "阅读", "听力"]);
  assert.equal(suggestedQuestionTypes([]).length, 0);
});

test("practice actions use supported category routes and mark the new exercise fresh", () => {
  const group = analyzeQuestionTypes([question("r", "阅读", "問題14 下の問い")], {})[0];
  for (const source of ["imported", "original", "favorites"]) {
    const url = new URL(questionTypePracticeHref({ source, year: source === "original" ? "2026" : "202412" }, group), "https://test.local");
    assert.equal(url.searchParams.get("fresh"), "1");
    assert.equal(url.searchParams.has("subtype"), false);
    if (source === "favorites") {
      assert.equal(url.pathname, "/favorites/practice");
      assert.equal(url.searchParams.get("category"), "阅读");
      assert.equal(url.searchParams.get("folder"), "all");
    } else {
      assert.equal(url.pathname, "/practice");
      assert.equal(url.searchParams.get("source"), source);
      assert.equal(url.searchParams.get("type"), "reading");
      assert.equal(url.searchParams.get("mode"), "practice");
      assert.equal(url.searchParams.get("level"), "N2");
    }
  }
});

test("analysis leaves frozen source questions and answers untouched", () => {
  const questions = Object.freeze([Object.freeze(question("q", "词汇", "問題1 読み方"))]);
  const answers = Object.freeze({ q: "A" });
  assert.equal(analyzeQuestionTypes(questions, answers)[0].percent, 100);
  assert.deepEqual(answers, { q: "A" });
});

test("a random report starts a new random category round instead of reusing its seed", () => {
  const group = analyzeQuestionTypes([question("g", "语法")], {})[0];
  const url = new URL(questionTypePracticeHref({ source: "imported", year: `random-${"a".repeat(32)}` }, group), "https://test.local");
  assert.equal(url.searchParams.get("year"), "random");
  assert.equal(url.searchParams.get("type"), "grammar");
  assert.equal(url.searchParams.get("fresh"), "1");
});

test("mistake and spaced review reports retry the mistake bank even when questions were never favorited", () => {
  const group = analyzeQuestionTypes([question("g", "语法")], {})[0];
  for (const id of ["mistakes-practice", "due-practice"]) {
    const url = new URL(questionTypePracticeHref({ id, source: "favorites", year: "favorites" }, group), "https://test.local");
    assert.equal(url.pathname, "/favorites/practice");
    assert.equal(url.searchParams.get("view"), "mistakes");
    assert.equal(url.searchParams.get("category"), "语法");
    assert.equal(url.searchParams.get("fresh"), "1");
    assert.equal(url.searchParams.has("folder"), false);
  }
  const favorite = new URL(questionTypePracticeHref({ id: "favorites-practice", source: "favorites", year: "favorites" }, group), "https://test.local");
  assert.equal(favorite.searchParams.has("view"), false);
  assert.equal(favorite.searchParams.get("folder"), "all");
});
