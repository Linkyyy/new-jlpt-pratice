import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { getAudioObjectKey, getAudioUrl, isAudioReference } from "../src/lib/audio-url.mjs";
import { collectAudioFiles, readAudioManifest } from "./r2-audio-files.mjs";

test("audio URLs preserve real mappings and can switch storage domains", () => {
  assert.equal(getAudioUrl("audio/202412n1/2.mp3", "https://cdn.example.com/"), "https://cdn.example.com/audio/202412n1/2.mp3");
  assert.equal(getAudioUrl("/imported-media/audio/202407n2/1.mp3", "https://new.example.com/jlpt"), "https://new.example.com/jlpt/audio/202407n2/1.mp3");
  assert.equal(getAudioUrl("https://old.example.com/shared.mp3", "https://new.example.com"), "https://old.example.com/shared.mp3");
  assert.equal(getAudioUrl("audio/202412n1/1.mp3", ""), null);
  assert.equal(getAudioUrl("/imported-media/audio/old.mp3", ""), "/imported-media/audio/old.mp3");
  assert.equal(getAudioUrl("audio/日本語 1.mp3", "https://cdn.example.com"), "https://cdn.example.com/audio/%E6%97%A5%E6%9C%AC%E8%AA%9E%201.mp3");
  assert.equal(getAudioObjectKey(".\\audio\\202412n1\\2.mp3"), "audio/202412n1/2.mp3");
});

test("unsafe paths and non-public audio URLs are rejected", () => {
  for (const input of ["../audio/1.mp3", "audio/../1.mp3", "audio/%2e%2e/1.mp3", "audio/%2fsecret/1.mp3", "audio//1.mp3", "audio/1.mp3?x=1", "audio/1.txt", "javascript:alert(1)", "http://external.example/1.mp3", "https://user:secret@example.com/1.mp3"]) assert.equal(isAudioReference(input), false, input);
  assert.equal(getAudioUrl("audio/1.mp3", "https://user:secret@example.com"), null);
  assert.equal(getAudioUrl("audio/1.mp3", "https://example.com?token=secret"), null);
  assert.throws(() => readAudioManifest({ version: 1, keys: ["audio/../1.mp3"] }));
});

test("uploader preserves directories, skips unrelated files and does not follow symlinks", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jlpt-audio-files-"));
  try {
    await fs.mkdir(path.join(root, "audio/202412n1"), { recursive: true });
    await fs.mkdir(path.join(root, "pic"));
    await fs.writeFile(path.join(root, "audio/202412n1/1.mp3"), "fixture");
    await fs.writeFile(path.join(root, "audio/notes.txt"), "skip");
    await fs.writeFile(path.join(root, "pic/2.mp3"), "skip");
    const files = await collectAudioFiles(root);
    assert.deepEqual(files.map(({ key, size }) => ({ key, size })), [{ key: "audio/202412n1/1.mp3", size: 7 }]);
    const out = execFileSync(process.execPath, ["scripts/upload-r2-audio.mjs", "--directory", root, "--dry-run"], { encoding: "utf8" });
    assert.match(out, /未连接 R2/);
    await fs.symlink(path.join(root, "pic"), path.join(root, "audio/link"));
    await assert.rejects(collectAudioFiles(root), /符号链接/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("import preserves shared audio mappings, supports an optional manifest and defers missing files to playback", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jlpt-audio-import-"));
  try {
    for (const dir of ["scripts", "src/lib", "input"]) await fs.mkdir(path.join(root, dir), { recursive: true });
    for (const file of ["scripts/import-question-bank.mjs", "scripts/r2-audio-files.mjs", "src/lib/audio-url.mjs", "src/lib/image-url.mjs"]) await fs.copyFile(new URL(`../${file}`, import.meta.url), path.join(root, file));
    const options = { option1: "first", option2: "second", answer: 1 };
    const rows = [
      { id: 1, audio: "audio/202412n2/7.mp3", bigTitle: "共有音声", extending: [{ id: 2, questionId: 42, ...options }, { id: 3, questionId: 43, ...options }] },
      { id: 4, questionId: 44, audio: "audio/202412n2/8.mp3", ...options },
      { id: 5, questionId: 45, ...options },
    ];
    await fs.writeFile(path.join(root, "input/time_202412_level_n2_type_4.json"), JSON.stringify(rows));
    const manifest = path.join(root, "uploaded.json");
    await fs.writeFile(manifest, JSON.stringify({ version: 1, keys: ["audio/202412n2/7.mp3"] }));
    execFileSync(process.execPath, [path.join(root, "scripts/import-question-bank.mjs"), "--source", path.join(root, "input"), "--audio-manifest", manifest]);
    const output = JSON.parse(await fs.readFile(path.join(root, "src/data/imported-bank/questions/202412-N2-4.json")));
    assert.equal(output.questions.length, 2);
    assert.equal(output.unavailable.length, 2);
    assert.equal(output.questions[0].sourceQuestionNumber, 42);
    assert.equal(output.questions[1].sourceQuestionNumber, 43);
    assert.equal(output.questions[0].media.audio, "audio/202412n2/7.mp3");
    assert.equal(output.questions[1].media.audio, output.questions[0].media.audio);
    assert.equal(output.questions[0].instruction, "共有音声");
    assert.match(output.unavailable[0].reasons.join(","), /缺少配套音频/);
    execFileSync(process.execPath, [path.join(root, "scripts/import-question-bank.mjs"), "--source", path.join(root, "input")]);
    const remote = JSON.parse(await fs.readFile(path.join(root, "src/data/imported-bank/questions/202412-N2-4.json")));
    assert.equal(remote.questions.length, 3);
    assert.equal(remote.questions[2].media.audio, "audio/202412n2/8.mp3");
    assert.equal(remote.unavailable.length, 1); // A record without any audio reference is still invalid.
    await assert.rejects(fs.access(path.join(root, "public")));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("uploader retries with a fresh stream and emits a manifest only after success", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jlpt-audio-upload-"));
  try {
    await fs.mkdir(path.join(root, "audio/202412n1"), { recursive: true });
    await fs.writeFile(path.join(root, "audio/202412n1/1.mp3"), "temporary MP3 bytes");
    const hook = path.join(root, "mock-s3.mjs");
    const manifest = path.join(root, "uploaded.json");
    // Inject the transport in a child process. No R2 credentials or network needed.
    await fs.writeFile(hook, `
      import { createRequire } from 'node:module';
      import assert from 'node:assert/strict';
      const { S3Client } = createRequire(${JSON.stringify(import.meta.url)})('@aws-sdk/client-s3');
      let attempts = 0;
      S3Client.prototype.send = async function(command) {
        const input = command.input;
        assert.equal(input.Key, 'audio/202412n1/1.mp3');
        assert.equal(input.ContentType, 'audio/mpeg');
        const chunks = []; for await (const chunk of input.Body) chunks.push(chunk);
        assert.equal(Buffer.concat(chunks).toString(), 'temporary MP3 bytes');
        assert.equal(input.ContentLength, 19);
        if (++attempts === 1) throw new Error('simulated network failure');
        return {};
      };
      process.on('exit', () => assert.equal(attempts, 2));
    `);
    execFileSync(process.execPath, ["--import", hook, "scripts/upload-r2-audio.mjs", "--directory", root, "--manifest", manifest], {
      env: { ...process.env, R2_ACCOUNT_ID: "a".repeat(32), R2_ACCESS_KEY_ID: "test-key", R2_SECRET_ACCESS_KEY: "test-secret", R2_BUCKET_NAME: "test-bucket" }, stdio: "pipe",
    });
    assert.deepEqual(JSON.parse(await fs.readFile(manifest)), { version: 1, keys: ["audio/202412n1/1.mp3"] });
    await fs.rm(manifest);
    await fs.writeFile(hook, `import { createRequire } from 'node:module'; const { S3Client } = createRequire(${JSON.stringify(import.meta.url)})('@aws-sdk/client-s3'); S3Client.prototype.send = async () => { throw new Error('offline'); };`);
    assert.throws(() => execFileSync(process.execPath, ["--import", hook, "scripts/upload-r2-audio.mjs", "--directory", root, "--manifest", manifest], {
      env: { ...process.env, R2_ACCOUNT_ID: "a".repeat(32), R2_ACCESS_KEY_ID: "test-key", R2_SECRET_ACCESS_KEY: "test-secret", R2_BUCKET_NAME: "test-bucket" }, stdio: "pipe",
    }), /上传失败/);
    await assert.rejects(fs.access(manifest));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("build refuses audio files in public deployment assets", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jlpt-audio-assets-"));
  const script = new URL("./check-audio-assets.mjs", import.meta.url);
  try {
    await fs.mkdir(path.join(root, "public"));
    await fs.writeFile(path.join(root, "public/recording.MP3"), "fixture");
    assert.throws(() => execFileSync(process.execPath, [script.pathname], { cwd: root, stdio: "pipe" }), /音频不能打包进 Vercel/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
