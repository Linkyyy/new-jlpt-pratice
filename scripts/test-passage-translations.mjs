import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const data = new URL("../src/data/", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, data), "utf8"));
const index = read("passage-translations/n1-index.json");
const passages = read("passage-translations/n1.zh.json");
const questionBank = read("question-bank.json");
const manifest = read("imported-bank/index.json");
const ocr = new Map(read("frequency-image-ocr/entries.json").images.filter(entry => entry.reviewed && entry.partial === false).map(entry => [entry.key, entry.text]));
const n1Questions = new Map();

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
