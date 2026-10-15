import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const modules = new Map();
function load(filename) {
  if (!modules.has(filename)) {
    const exports = {};
    modules.set(filename, exports);
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(output, { exports, process, require: specifier => {
      if (specifier.startsWith("@/")) return require(path.join(root, "src", specifier.slice(2)));
      if (!specifier.startsWith(".")) return require(specifier);
      const dependency = path.resolve(path.dirname(filename), specifier);
      return path.extname(dependency) ? require(dependency) : load(`${dependency}.ts`);
    } }, { filename });
  }
  return modules.get(filename);
}
const papers = load(path.join(root, "src/data/imported-papers.server.ts"));
const catalog = load(path.join(root, "src/data/bank-catalog.ts"));
const manifest = require("../src/data/imported-bank/index.json");

test("full imported papers include listening after the written sections", async () => {
  const paper = await papers.loadPracticePaper("imported", "N2", "202412", "all");
  assert.equal(paper.id, "imported-N2-202412-all");
  assert.equal(paper.typeLabel, "整卷练习");
  assert.equal(paper.questions.length, 99);
  assert.equal(paper.excludedCount, 2);
  assert.equal(paper.questions.slice(0, 30).every(question => question.category === "词汇"), true);
  assert.equal(paper.questions.slice(30, 51).every(question => question.category === "语法"), true);
  assert.equal(paper.questions.slice(51, 69).every(question => question.category === "阅读"), true);
  assert.equal(paper.questions.slice(69).every(question => question.category === "听力" && question.media.audio), true);
  assert.equal(paper.questions[69].media.audio, "audio/202412n2/1.mp3");
});

test("full-paper advertised counts match every imported level and period", async () => {
  const selections = new Map(manifest.groups.map(group => [`${group.level}-${group.period}`, group]));
  for (const { level, period } of selections.values()) {
    const paper = await papers.loadPracticePaper("imported", level, period, "all");
    const count = catalog.getBankCount("imported", level, period, "all");
    assert.equal(count.available, paper.questions.length, `${level}-${period} available`);
    assert.equal(count.excluded, paper.excludedCount, `${level}-${period} excluded`);
    assert.equal(new Set(paper.questions.map(question => question.id)).size, paper.questions.length);
  }
});

test("single listening practice keeps its audio paths and count", async () => {
  const paper = await papers.loadPracticePaper("imported", "N2", "202412", "listening");
  assert.equal(paper.questions.length, 30);
  assert.equal(paper.typeLabel, "听力");
  assert.equal(paper.questions.every(question => question.category === "听力"), true);
  assert.equal(catalog.getBankCount("imported", "N2", "202412", "listening").available, 30);
});

test("original papers retain their actual written questions without invented listening", async () => {
  const paper = await papers.loadPracticePaper("original", "N2", "2026", "all");
  assert.equal(paper.questions.length, 9);
  assert.equal(paper.questions.some(question => question.category === "听力"), false);
  assert.equal(catalog.getBankCount("original", "N2", "2026", "all").available, 9);
  assert.equal((await papers.loadPracticePaper("original", "N2", "2026", "listening")).questions.length, 0);
});

test("mixed favorites still load original, listening and written question IDs in order", async () => {
  const full = await papers.loadPracticePaper("imported", "N2", "202412", "all");
  const original = await papers.loadPracticePaper("original", "N2", "2026", "all");
  const ids = [original.questions[0].id, full.questions[69].id, full.questions[30].id];
  const favorites = await papers.loadFavoriteQuestions([...ids, "invalid-question"]);
  assert.equal(favorites.map(item => item.question.id).join(","), ids.join(","));
  assert.equal(favorites[1].question.media.audio, full.questions[69].media.audio);
  assert.equal(favorites[0].source, "original");
  assert.equal(favorites[1].source, "imported");
});
