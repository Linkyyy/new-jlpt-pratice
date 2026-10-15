import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { isAudioReference } from "../src/lib/audio-url.mjs";
import { isImageReference } from "../src/lib/image-url.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "src/data/imported-bank");
const manifest = JSON.parse(await fs.readFile(path.join(directory, "index.json"), "utf8"));
const ids = new Set();
let available = 0;
let unavailable = 0;
for (const group of manifest.groups) {
  assert.match(group.file, /^\d{6}-N[1-5]-[1-4]\.json$/);
  const payload = JSON.parse(await fs.readFile(path.join(directory, "questions", group.file), "utf8"));
  assert.equal(payload.questions.length, group.availableCount);
  assert.equal(payload.unavailable.length, group.unavailableCount);
  assert.equal(group.totalCount, group.availableCount + group.unavailableCount);
  for (const question of payload.questions) {
    assert(!ids.has(question.id), `Duplicate ID: ${question.id}`);
    ids.add(question.id);
    assert.equal(question.level, group.level);
    assert.match(question.id, new RegExp(`^imported:${group.period}:${group.level}:`));
    assert(question.prompt.length > 0);
    assert(question.options.length >= 2 && question.options.length <= 4);
    assert.equal(new Set(question.options.map((option) => option.id)).size, question.options.length);
    assert(question.options.some((option) => option.id === question.correctOptionId));
    assert(question.explanation.length > 0);
    if (question.media?.audio) assert(isAudioReference(question.media.audio), `Invalid audio reference: ${question.id}`);
    if (question.category === "听力") assert(question.media?.audio, `Missing listening audio: ${question.id}`);
    for (const reference of question.media?.images ?? []) {
      assert(isImageReference(reference), `Invalid image reference: ${question.id}`);
      if (reference.startsWith("/imported-media/")) assert((await fs.stat(path.join(root, "public", reference.slice(1)))).isFile());
    }
  }
  available += group.availableCount;
  unavailable += group.unavailableCount;
}
assert.equal(available, manifest.report.available);
assert.equal(unavailable, manifest.report.unavailable);
assert.equal(available + unavailable, manifest.report.questions);
console.log(JSON.stringify({ passed: true, groups: manifest.groups.length, available, unavailable, uniqueAvailableIds: ids.size }));
