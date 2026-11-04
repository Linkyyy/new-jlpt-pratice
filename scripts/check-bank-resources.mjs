import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getAudioUrl } from "../src/lib/audio-url.mjs";
import { getImageUrl } from "../src/lib/image-url.mjs";

/** Audit shared files once, retaining every affected question for fixing mappings. */
export function collectBankResources(banks, baseUrl) {
  const resources = new Map();
  for (const bank of banks) for (const question of [...(bank.questions ?? []), ...(bank.unavailable ?? [])]) {
    const media = question.media ?? {}, raw = question.raw ?? {};
    const audio = media.audio || raw.audio;
    const listening = bank.type === "listening" || question.category === "听力";
    const images = [
      ...(media.images ?? []), ...(media.questionImages ?? []),
      media.picture || raw.picture, media.questionPicture || raw.questionPicture,
    ].filter(Boolean);
    const references = [
      ...(audio || listening ? [["audio", audio || ""]] : []),
      ...images.map(reference => ["image", reference]),
    ];
    for (const [kind, reference] of references) {
      const url = kind === "audio" ? getAudioUrl(reference, baseUrl) : getImageUrl(reference, baseUrl);
      const key = `${kind}:${reference ? url ?? reference : `missing:${question.id}`}`;
      if (!resources.has(key)) resources.set(key, { kind, reference, url, questionIds: [], questions: [], status: !reference ? "missing-reference" : url ? "unchecked" : "invalid-reference" });
      const resource = resources.get(key);
      if (!resource.questionIds.includes(question.id)) {
        resource.questionIds.push(question.id);
        resource.questions.push({id: question.id, period: bank.period, level: bank.level ?? question.level, type: bank.type,
          questionNumber: question.sourceQuestionNumber ?? question.questionNumber ?? null,
          enabled: !bank.unavailable?.includes(question)});
      }
    }
  }
  return [...resources.values()];
}

/** Text-only imports have no authoritative audio/image mappings or answers to audit. */
export function pendingListeningImports(banks, transcripts) {
  return transcripts.groups.flatMap(group => {
    const bank = banks.find(bank => bank.type === "listening" && bank.period === group.period && bank.level === group.level);
    const questions = [...(bank?.questions ?? []), ...(bank?.unavailable ?? [])];
    const ids = new Set(questions.map(question => question.id));
    const missing = group.questions.filter(question => !ids.has(question.id));
    return missing.length ? [{period: group.period, level: group.level, sourceFile: group.sourceFile,
      questions: missing.length, status: "source-required", reason: "仅有听力原文统计，尚未导入答案及音频、图片对应关系"}] : [];
  });
}

export async function probeResource(url, fetcher = fetch) {
  try {
    let response = await fetcher(url, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
    if (response.status === 405 || response.status === 501) {
      response = await fetcher(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(8_000) });
    }
    // Do not download the recording when a server ignores the byte range.
    await response.body?.cancel();
    return { status: response.ok ? "available" : response.status === 404 ? "missing" : "unreachable", httpStatus: response.status };
  } catch { return { status: "unreachable" }; }
}

export async function auditResources(resources, { remote = false, limit = 100, concurrency = 4, publicDirectory, fetcher } = {}) {
  const output = resources.map(resource => ({ ...resource }));
  const queue = [];
  for (const resource of output) {
    if (!resource.url) continue;
    if (resource.url.startsWith("/")) {
      const file = path.resolve(publicDirectory, `.${resource.url}`);
      if (!file.startsWith(path.resolve(publicDirectory) + path.sep)) { resource.status = "invalid-reference"; continue; }
      try { await fs.access(file); resource.status = "available"; } catch { resource.status = "missing"; }
    } else if (remote && queue.length < limit) queue.push(resource);
  }
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (index < queue.length) {
      const resource = queue[index++];
      Object.assign(resource, await probeResource(resource.url, fetcher));
    }
  }));
  return { checkedAt: new Date().toISOString(), remote, remoteLimit: limit, summary: output.reduce((counts, item) => { counts[item.status] = (counts[item.status] ?? 0) + 1; return counts; }, {}), resources: output };
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(["--remote", "--limit", "--concurrency", "--output"]);
  let remote = false, limit = 100, concurrency = 4, output;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!allowed.has(arg)) throw new Error(`未知参数：${arg}`);
    if (arg === "--remote") { remote = true; continue; }
    const value = args[++index];
    if (!value) throw new Error(`${arg} 缺少参数`);
    if (arg === "--output") output = path.resolve(value);
    else if (arg === "--limit") limit = Number(value);
    else concurrency = Number(value);
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error("limit 必须为正整数，concurrency 必须为 1–8。");
  const directory = new URL("../src/data/imported-bank/questions/", import.meta.url);
  const banks = await Promise.all((await fs.readdir(directory)).filter(name => name.endsWith(".json")).sort().map(async name => JSON.parse(await fs.readFile(new URL(name, directory), "utf8"))));
  const resources = collectBankResources(banks, process.env.NEXT_PUBLIC_AUDIO_BASE_URL);
  const report = await auditResources(resources, { remote, limit, concurrency, publicDirectory: path.resolve("public") });
  const transcriptDirectory = new URL("../src/data/frequency-listening/exams/", import.meta.url);
  const transcripts = {groups: await Promise.all((await fs.readdir(transcriptDirectory)).filter(name => name.endsWith(".json")).sort()
    .map(async name => JSON.parse(await fs.readFile(new URL(name, transcriptDirectory), "utf8"))))};
  report.pendingListeningImports = pendingListeningImports(banks, transcripts);
  report.summaryByKind = Object.fromEntries(["audio", "image"].map(kind => [kind, report.resources.filter(resource => resource.kind === kind)
    .reduce((counts, resource) => { counts[resource.status] = (counts[resource.status] ?? 0) + 1; return counts; }, {})]));
  if (output) { await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n"); }
  console.log(JSON.stringify({ total: resources.length, ...report.summary, summaryByKind: report.summaryByKind,
    pendingListeningImports: report.pendingListeningImports, remote, remoteLimit: limit, ...(output ? { output } : {}) }, null, 2));
  if (!remote) console.log("仅验证引用和本地文件，远端资源未请求；使用 --remote 检查公开URL，默认最多100个，不下载整段音频。");
  if (report.summary.missing || report.summary["missing-reference"] || report.summary["invalid-reference"] || report.summary.unreachable || report.pendingListeningImports.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
