import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectBankResources, auditResources, probeResource, pendingListeningImports } from "./check-bank-resources.mjs";

test("resource collection preserves shared audio and question-specific image mappings", () => {
  const media = { audio: "audio/202412n1/1.mp3", images: ["pic/shared.jpg"], questionImages: ["pic/child.jpg"] };
  const resources = collectBankResources([{ questions: [{ id: "a", media }, { id: "b", media: { ...media, questionImages: [] } }] }], "https://example.com");
  assert.equal(resources.length, 3);
  assert.deepEqual(resources.find(item => item.kind === "audio").questionIds, ["a", "b"]);
  assert.deepEqual(resources.find(item => item.reference === "pic/child.jpg").questionIds, ["a"]);
});

test("disabled questions retain their raw image/audio paths and share resources with enabled questions", () => {
  const audio = "audio/202407n3/1.mp3", picture = "pic/320240774.jpg";
  const resources = collectBankResources([{period: "202407", level: "N3", type: "listening",
    questions: [{id: "enabled", sourceQuestionNumber: 75, media: {audio, images: []}}],
    unavailable: [{id: "disabled", questionNumber: 74, raw: {audio, picture, questionPicture: "pic/child.jpg"}}],
  }]);
  assert.equal(resources.length, 3);
  const recording = resources.find(resource => resource.kind === "audio");
  assert.deepEqual(recording.questionIds, ["enabled", "disabled"]);
  assert.deepEqual(recording.questions.map(question => question.enabled), [true, false]);
  assert.equal(recording.questions[1].questionNumber, 74);
  assert.equal(resources.find(resource => resource.reference === picture).status, "unchecked");
  assert.ok(resources.some(resource => resource.reference === "pic/child.jpg"));
});

test("listening without an audio mapping is flagged separately from an HTTP 404", async () => {
  const resources = collectBankResources([{type: "listening", questions: [{id: "a"}, {id: "b", media: {images: []}}]}]);
  assert.equal(resources.length, 2);
  const report = await auditResources(resources, {remote: true, fetcher() { throw new Error("must not fetch missing references"); }});
  assert.deepEqual(report.summary, {"missing-reference": 2});
  assert.ok(report.resources.every(resource => resource.url === null && resource.httpStatus === undefined));
});

test("transcript-only exams are reported as pending import without inventing resource URLs", () => {
  const group = {period: "202512", level: "N1", sourceFile: "source.json", questions: [{id: "a"}, {id: "b"}]};
  const banks = [{period: "202512", level: "N1", type: "listening", questions: [{id: "a"}], unavailable: []}];
  const pending = pendingListeningImports(banks, {groups: [group]});
  assert.equal(pending.length, 1); assert.equal(pending[0].questions, 1); assert.equal(pending[0].status, "source-required");
  assert.equal(pending[0].sourceFile, "source.json");
  banks[0].unavailable.push({id: "b"});
  assert.deepEqual(pendingListeningImports(banks, {groups: [group]}), []);
});

test("offline audits do not fetch remote files and enforce local file mappings", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jlpt-resources-"));
  try {
    await mkdir(path.join(directory, "imported-media"));
    await writeFile(path.join(directory, "imported-media", "ok.jpg"), "image");
    const input = collectBankResources([{ questions: [{ id: "a", media: { images: ["pic/remote.jpg", "/imported-media/ok.jpg", "/imported-media/missing.jpg", "pic/../bad.jpg"] } }] }]);
    const result = await auditResources(input, { publicDirectory: directory, fetcher: () => { throw new Error("must not fetch"); } });
    assert.equal(result.summary.unchecked, 1); assert.equal(result.summary.available, 1); assert.equal(result.summary.missing, 1); assert.equal(result.summary["invalid-reference"], 1);
  } finally { await rm(directory, { recursive: true }); }
});

test("remote checks are capped and distinguish missing files from network errors", async () => {
  const input = ["a", "b", "c"].map(id => ({ url: `https://example.com/${id}`, status: "unchecked" }));
  let calls = 0;
  const result = await auditResources(input, { remote: true, limit: 2, fetcher: async () => { calls++; return new Response(null, { status: calls === 1 ? 404 : 403 }); } });
  assert.equal(calls, 2); assert.equal(result.summary.missing, 1); assert.equal(result.summary.unreachable, 1); assert.equal(result.summary.unchecked, 1);
});

test("HEAD fallback requests one byte and cancels a full response body", async () => {
  let cancelled = false;
  const methods = [];
  const result = await probeResource("https://example.com/audio.mp3", async (_url, options) => {
    methods.push(options.method ?? "GET");
    if (options.method === "HEAD") return new Response(null, { status: 405 });
    assert.equal(options.headers.Range, "bytes=0-0");
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  });
  assert.deepEqual(methods, ["HEAD", "GET"]); assert.equal(result.status, "available"); assert.equal(cancelled, true);
});
