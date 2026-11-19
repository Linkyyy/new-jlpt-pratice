import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const data = new URL("../src/data/", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, data), "utf8"));
const index = read("passage-translations/n1-index.json");
const passages = read("passage-translations/n1.zh.json");
const questionBank = read("question-bank.json");
const manifest = read("imported-bank/index.json");
const ocr = new Map(read("frequency-image-ocr/entries.json").images.filter(entry => entry.reviewed && entry.partial === false).map(entry => [entry.key, entry.text]));
const n1Questions = new Map();
const sentenceModule = ts.transpileModule(readFileSync(new URL("passage-sentences.ts", data), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { passageSentences } = await import(`data:text/javascript;base64,${Buffer.from(sentenceModule).toString("base64")}`);

for (const group of manifest.groups.filter(group => group.level === "N1" && ["grammar", "reading"].includes(group.type))) {
  for (const question of read(`imported-bank/questions/${group.file}`).questions) n1Questions.set(question.id, question);
}
for (const { reading } of Object.values(questionBank.papers.N1)) {
  for (const [id] of reading.questions) n1Questions.set(id, { passage: reading.passage });
}

function compact(text) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " " };
  return text.replace(/<[^>]*>/g, "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, value) => {
    if (value.startsWith("#x")) return String.fromCodePoint(parseInt(value.slice(2), 16));
    if (value.startsWith("#")) return String.fromCodePoint(Number(value.slice(1)));
    return entities[value] ?? entity;
  }).replace(/\s/g, "");
}

test("N1 text passages and verified transcriptions retain their source text", () => {
  for (const [questionId, question] of n1Questions) {
    const imageRefs = question.media?.images ?? [];
    const written = compact(question.passage ?? "");
    const hasImageText = !written && imageRefs.length > 0 && imageRefs.every(ref => ocr.has(ref));
    if (!written && !hasImageText) {
      assert.equal(index[questionId], undefined, questionId);
      continue;
    }
    const passage = passages[index[questionId]];
    assert.ok(passage?.paragraphs.length, questionId);
    assert.equal(Boolean(passage.transcribedImage), hasImageText, questionId);
    assert.ok(passage.paragraphs.every(({ original, translation }) => original.trim() && translation.trim()), questionId);
    const original = written || compact(imageRefs.map(ref => ocr.get(ref)).join(""));
    assert.equal(compact(passage.paragraphs.map(paragraph => paragraph.original).join("")), original, questionId);
  }
  for (const id of Object.keys(index)) assert.ok(n1Questions.has(id), id);
});

test("sibling questions use the same translation and grammar blanks stay in the reviewed passage", () => {
  const group = ["imported:201507:N1:3:5346:56", "imported:201507:N1:3:5347:57", "imported:201507:N1:3:5348:58"];
  assert.ok(group.every(id => index[id] === index[group[0]]));
  const [first, second] = passages[index[group[0]]].paragraphs;
  assert.match(first.original, /人類は/);
  assert.match(first.translation, /人类.*城市/);
  assert.match(second.translation, /城市社会空间/);

  const grammar = passages[index["imported:201607:N1:2:5117:41"]];
  assert.match(grammar.paragraphs[0].translation, /（41）/);
  assert.match(grammar.paragraphs[4].translation, /（45）/);
});

test("sentence review retains every line of the existing bilingual passages", () => {
  for (const passage of passages) {
    const sentences = passageSentences(passage);
    assert.ok(sentences.every(pair => pair.original.trim() && pair.translation.trim()));
    for (const key of ["original", "translation"]) {
      const text = (pairs) => pairs.map(pair => pair[key]).join("").replace(/\s/gu, "");
      assert.equal(text(sentences), text(passage.paragraphs));
    }
    if (passage.transcribedImage) assert.deepEqual(sentences, passage.paragraphs);
  }
});

test("sentence review aligns split and merged translations, quotes, and grammar blanks", () => {
  const reading = passageSentences(passages[index["imported:201507:N1:3:5346:56"]]);
  assert.match(reading[0].original, /^\(3\)\n人類は/);
  assert.match(reading[0].translation, /人类在创造出“城市”/);
  assert.match(reading[1].translation, /在村落里.*。他们形成社会关系的前提/);
  assert.match(reading[2].original, /^都市の街頭において/);
  assert.match(reading[2].translation, /^在城市街头/);

  const grammar = passageSentences(passages[index["imported:201607:N1:2:5117:41"]]);
  assert.equal(grammar[0].combined, true);
  assert.match(grammar[3].original, /^「よろしくお願いしますッ！」と店のカード/);
  assert.match(grammar[3].translation, /“请多多关照！”/);
  assert.match(grammar[5].translation, /（41）/);

  const blanks = passageSentences(passages[index["imported:201007:N1:2:6395:41"]]);
  assert.match(blanks[2].original, /^\(　41　\)、/);
  assert.match(blanks[2].translation, /^（41），/);
});

test("each N1 sentence button fits the rendered original, including passages with underlines", () => {
  const exports = {};
  const source = readFileSync(new URL("../src/components/rich-content.tsx", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: createRequire(import.meta.url) });
  const checked = new Set();
  for (const [questionId, position] of Object.entries(index)) {
    const passage = passages[position];
    if (passage.transcribedImage || checked.has(position)) continue;
    checked.add(position);
    const { passage: text, richText: html } = n1Questions.get(questionId);
    const insertAfter = passageSentences(passage).map(({ original }) => ({
      original, content: createElement("i", { "data-test-sentence-end": "" }),
    }));
    const base = renderToStaticMarkup(createElement(exports.default, { text, html }));
    const annotated = renderToStaticMarkup(createElement(exports.default, { text, html, insertAfter }));
    assert.equal((annotated.match(/data-test-sentence-end=/g) ?? []).length, insertAfter.length, questionId);
    const stripAnnotation = annotated.replace(/<i data-test-sentence-end=""><\/i>|<span data-passage-node="\d+" data-passage-offset="\d+">|<\/span>/g, "");
    assert.equal(stripAnnotation, base.replace(/<\/span>/g, ""), questionId);
  }
});
