import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url)), require = createRequire(import.meta.url), modules = new Map();
function load(filename) {
  if (!modules.has(filename)) {
    const exports = {}; modules.set(filename, exports);
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(output, { exports, process, crypto: webcrypto, require: specifier => {
      if (specifier.startsWith("@/")) {
        const dependency = path.join(root, "src", specifier.slice(2));
        return path.extname(dependency) ? require(dependency) : load(`${dependency}.ts`);
      }
      if (!specifier.startsWith(".")) return require(specifier);
      const dependency = path.resolve(path.dirname(filename), specifier);
      return path.extname(dependency) ? require(dependency) : load(`${dependency}.ts`);
    } }, { filename });
  }
  return modules.get(filename);
}
const random = load(path.join(root, "src/data/random-practice.ts"));
const catalog = load(path.join(root, "src/data/bank-catalog.ts"));
const papers = load(path.join(root, "src/data/imported-papers.server.ts"));
const article = load(path.join(root, "src/app/practice/article-questions.ts"));
const restore = load(path.join(root, "src/lib/restore-practice-paper.ts"));
const validation = load(path.join(root, "src/lib/backup-validation.ts"));
const seed = number => `random-${number.toString(16).padStart(32, "0")}`;
const ids = questions => questions.map(question => question.id).join("|");

test("random period validation accepts only the sentinel or a bounded seed and generated rounds are unique", () => {
  assert.equal(random.isRandomPeriod("random"), true);
  assert.equal(random.isRandomPeriod(seed(1)), true);
  for (const value of ["", "202412", "random-", "random-../", `random-${"f".repeat(33)}`, `random-${"g".repeat(32)}`]) assert.equal(random.isRandomPeriod(value), false);
  const rounds = Array.from({ length: 20 }, () => random.createRandomPeriod());
  assert.equal(new Set(rounds).size, rounds.length);
  assert.ok(rounds.every(random.isRandomPeriod));
  assert.equal(catalog.formatPeriod(seed(1)), "随机练习");
});

test("random pools aggregate only the selected source, level and category across real periods", async () => {
  for (const source of ["original", "imported"]) for (const type of ["vocabulary", "grammar", "reading", "listening"]) {
    const periods = catalog.getBankPeriods(source, "N2");
    const count = catalog.getBankCount(source, "N2", "random", type);
    assert.equal(count.available, periods.reduce((sum, period) => sum + catalog.getBankCount(source, "N2", period, type).available, 0));
    const paper = await papers.loadPracticePaper(source, "N2", seed(1), type);
    assert.ok(paper.questions.every(question => question.level === "N2" && question.category === ({ vocabulary: "词汇", grammar: "语法", reading: "阅读", listening: "听力" })[type]));
    assert.ok(paper.questions.every(question => source === "imported" ? question.id.startsWith("imported:") : !question.id.startsWith("imported:")));
    assert.equal(new Set(paper.questions.map(question => question.id)).size, paper.questions.length);
    assert.ok(paper.questions.length <= count.available);
  }
  assert.equal((await papers.loadPracticePaper("original", "N2", seed(1), "vocabulary")).questions.length, 6);
  await assert.rejects(papers.loadPracticePaper("imported", "N2", seed(1), "all"));
  await assert.rejects(papers.loadPracticePaper("imported", "N2", "random", "vocabulary"));
});

test("fixed seeds reproduce selection and order, new seeds vary the round, and source questions stay unchanged", async () => {
  const first = await papers.loadPracticePaper("imported", "N2", seed(1), "vocabulary");
  const same = await papers.loadPracticePaper("imported", "N2", seed(1), "vocabulary");
  const different = await papers.loadPracticePaper("imported", "N2", seed(2), "vocabulary");
  assert.equal(first.questions.length, 20);
  assert.equal(ids(first.questions), ids(same.questions));
  assert.notEqual(ids(first.questions), ids(different.questions));
  assert.ok(new Set(first.questions.map(random.questionPeriod)).size > 1);
  const originals = await papers.loadFavoriteQuestions(first.questions.map(question => question.id));
  assert.equal(JSON.stringify(first.questions), JSON.stringify(originals.map(item => item.question)));
});

test("reading, long grammar and shared listening groups are complete, adjacent and in their original order", async () => {
  for (const type of ["reading", "grammar", "listening"]) {
    const pools = await Promise.all(catalog.getBankPeriods("imported", "N2").map(period => papers.loadPracticePaper("imported", "N2", period, type)));
    const pool = pools.flatMap(paper => paper.questions);
    for (const number of [3, 12, 25]) {
      const selected = random.selectRandomQuestions(pool, seed(number)), snapshot = ids(pool);
      assert.ok(selected.length >= 20);
      for (const question of selected) {
        const group = pool.filter(item => article.articleGroupKey(item) === article.articleGroupKey(question));
        const start = selected.findIndex(item => item.id === group[0].id);
        assert.ok(start >= 0);
        assert.equal(ids(selected.slice(start, start + group.length)), ids(group));
      }
      assert.equal(ids(pool), snapshot);
    }
  }
});

test("identical passages from different sessions remain separate and a long group is never truncated", () => {
  const pool = ["202407", "202412"].flatMap(period => Array.from({ length: 4 }, (_, index) => ({ id: `imported:${period}:N3:3:1:${index + 1}`, level: "N3", category: "阅读", passage: "Same passage", prompt: "Question", options: [{ id: "A", text: "A" }], correctOptionId: "A", explanation: ["A"] })));
  const selected = random.selectRandomQuestions(pool, seed(4), 1);
  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map(random.questionPeriod)).size, 1);
  assert.equal(article.articleGroup(pool, selected[0]).length, 4);
  assert.equal(random.selectRandomQuestions([], seed(1)).length, 0);
  assert.equal(random.selectRandomQuestions([...pool, ...pool], seed(1)).length, pool.length);
  assert.throws(() => random.selectRandomQuestions(pool, seed(1), 0));
});

test("random snapshots retain their seed and restore through the unchanged backup format without reshuffling", async () => {
  const paper = await papers.loadPracticePaper("imported", "N2", seed(9), "reading"), now = Date.now();
  const attempt = { id: "random-backup", paperId: paper.id, source: paper.source, level: paper.level, year: paper.year, type: "reading", typeLabel: paper.typeLabel, periodLabel: paper.periodLabel, mode: "practice", createdAt: now, updatedAt: now, completedAt: null, status: "active", questionIndex: 1, answers: {}, deadline: null, elapsedSeconds: 0, timedOut: false, fontSize: 18, questions: paper.questions.map(question => ({ id: question.id, level: question.level, category: question.category, correctOptionId: question.correctOptionId, optionIds: question.options.map(option => option.id), sourceQuestionNumber: question.sourceQuestionNumber })) };
  const backup = { format: "jlpt-practice-backup", version: 1, exportedAt: new Date(now).toISOString(), study: { version: 1, attempts: [attempt], activityDays: [] }, favorites: { version: 2, folders: [{ id: "default", name: "默认收藏夹" }], entries: [] } };
  const restored = JSON.parse(JSON.stringify(backup));
  assert.equal(validation.isLearningBackup(restored), true);
  const same = await papers.loadPracticePaper(restored.study.attempts[0].source, "N2", restored.study.attempts[0].year, "reading");
  assert.equal(ids(restore.restorePracticePaper(same, restored.study.attempts[0], "practice").questions), ids(paper.questions));
  assert.equal(restore.restorePracticePaper({ ...same, questions: [...same.questions].reverse() }, attempt, "practice"), null);
});
