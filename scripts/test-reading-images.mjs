import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import test from "node:test";
import ts from "typescript";
import { getImageObjectKey, getImageUrl, isImageReference } from "../src/lib/image-url.mjs";

const article = {};
vm.runInNewContext(ts.transpileModule(await fs.readFile(new URL("../src/app/practice/article-questions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: article });

test("reading pictures preserve filenames and use the audio R2 base", () => {
  assert.equal(getImageUrl("pic/220241270.jpg"), "https://pub-8ac2a059bee9443c839a7e7f2f350e93.r2.dev/pic/220241270.jpg");
  assert.equal(getImageUrl("pic/220241270.jpg", "https://cdn.example.com/jlpt/"), "https://cdn.example.com/jlpt/pic/220241270.jpg");
  assert.equal(getImageUrl("/imported-media/pic/old.jpg"), "/imported-media/pic/old.jpg");
  assert.equal(getImageObjectKey("pic/日本語 1.jpg"), "pic/日本語 1.jpg");
  assert.equal(getImageUrl("pic/日本語 1.jpg", "https://cdn.example.com"), "https://cdn.example.com/pic/%E6%97%A5%E6%9C%AC%E8%AA%9E%201.jpg");
  for (const input of ["pic/../x.jpg", "pic/%2e%2e/x.jpg", "pic/%2fx.jpg", "pic//x.jpg", "pic/x.jpg?secret=1", "pic/x.svg", "audio/1.mp3", "/imported-media/../x.jpg", "https://external.example/x.jpg"]) assert.equal(isImageReference(input), false, input);
  for (const base of ["http://cdn.example.com", "https://user:pass@cdn.example.com", "https://cdn.example.com?token=1"]) assert.equal(getImageUrl("pic/1.jpg", base), null);
});

test("image reading subquestions share a drawer without requiring passage text", async () => {
  const bank = JSON.parse(await fs.readFile(new URL("../src/data/imported-bank/questions/202412-N2-3.json", import.meta.url)));
  const [first, second] = bank.questions.slice(-2);
  assert.equal(bank.questions.length, 20);
  assert.equal(bank.unavailable.length, 0);
  assert.equal(first.sourceQuestionNumber, 70);
  assert.equal(second.sourceQuestionNumber, 71);
  assert.equal(first.instruction, second.instruction);
  assert.deepEqual(first.media.images, ["pic/220241270.jpg"]);
  assert.deepEqual(first.media.images, second.media.images);
  assert.equal(article.usesArticleDrawer(first), true);
  assert.equal(article.articleGroup(bank.questions, first).length, 2);
  const unrelated = { ...second, media: { images: ["pic/different.jpg"] } };
  assert.notEqual(article.articleGroupKey(first), article.articleGroupKey(unrelated));
});

test("all 168 previously excluded reading questions are available with original image mappings", async () => {
  const manifest = JSON.parse(await fs.readFile(new URL("../src/data/imported-bank/index.json", import.meta.url)));
  let opened = 0;
  const images = new Set();
  for (const group of manifest.groups.filter(group => group.type === "reading")) {
    const bank = JSON.parse(await fs.readFile(new URL(`../src/data/imported-bank/questions/${group.file}`, import.meta.url)));
    const pictures = bank.questions.filter(question => question.media?.images.some(image => image.startsWith("pic/")));
    if (!bank.questions.length) continue;
    assert.equal(pictures.length, 2, group.file);
    assert.deepEqual(bank.questions.slice(-2).map(q => q.id), pictures.map(q => q.id));
    assert.equal(group.unavailableCount, 0);
    for (const question of pictures) { assert.ok(question.prompt); assert.ok(question.instruction); assert.ok(question.options.some(option => option.id === question.correctOptionId)); question.media.images.forEach(image => images.add(image)); }
    opened += pictures.length;
  }
  assert.equal(opened, 168);
  assert.equal(images.size, 85);
  const exception = JSON.parse(await fs.readFile(new URL("../src/data/imported-bank/questions/202312-N3-3.json", import.meta.url)));
  assert.deepEqual(exception.questions.slice(-2).map(q => q.media.images[0]), ["pic/320231272.jpg", "pic/320231274.jpg"]);
});

test("reimport keeps shared reading images playable before upload without opening unrelated missing media", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jlpt-image-import-"));
  try {
    for (const dir of ["scripts", "src/lib", "input"]) await fs.mkdir(path.join(root, dir), { recursive: true });
    for (const file of ["scripts/import-question-bank.mjs", "scripts/r2-audio-files.mjs", "src/lib/audio-url.mjs", "src/lib/image-url.mjs"]) await fs.copyFile(new URL(`../${file}`, import.meta.url), path.join(root, file));
    const options = { option1: "first", option2: "second", answer: 1 };
    const rows = [{ id: 70, picture: "pic/220241270.jpg", bigTitle: "問題14", extending: [{ id: 70, questionId: 70, littleQuestion: "question one", ...options }, { id: 71, questionId: 71, littleQuestion: "question two", ...options }] }];
    await fs.writeFile(path.join(root, "input/time_202412_level_n2_type_3.json"), JSON.stringify(rows));
    await fs.writeFile(path.join(root, "input/time_202412_level_n2_type_4.json"), JSON.stringify([{ id: 1, questionId: 72, picture: "pic/listening.jpg", audio: "audio/202412n2/1.mp3", ...options }]));
    execFileSync(process.execPath, [path.join(root, "scripts/import-question-bank.mjs"), "--source", path.join(root, "input")]);
    const bank = JSON.parse(await fs.readFile(path.join(root, "src/data/imported-bank/questions/202412-N2-3.json")));
    assert.equal(bank.questions.length, 2);
    assert.equal(bank.unavailable.length, 0);
    assert.equal(bank.questions[0].instruction, "問題14");
    assert.deepEqual(bank.questions[0].media.images, ["pic/220241270.jpg"]);
    assert.deepEqual(bank.questions[1].media.images, bank.questions[0].media.images);
    const listening = JSON.parse(await fs.readFile(path.join(root, "src/data/imported-bank/questions/202412-N2-4.json")));
    assert.equal(listening.questions.length, 0);
    assert.equal(listening.unavailable.length, 1);
    await assert.rejects(fs.access(path.join(root, "public")));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
