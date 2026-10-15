import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAudioObjectKey, isPublicAudioUrl } from "../src/lib/audio-url.mjs";
import { readAudioManifest } from "./r2-audio-files.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const mediaIndex = args.indexOf("--media");
const audioIndex = args.indexOf("--audio-manifest");
if (sourceIndex < 0 || !args[sourceIndex + 1]) throw new Error("Usage: node scripts/import-question-bank.mjs --source <JSON directory> [--media <local image directory>] [--audio-manifest <uploaded R2 keys JSON>]");
if (audioIndex >= 0 && !args[audioIndex + 1]) throw new Error("--audio-manifest 需要指定已上传对象清单。");
const uploadedAudio = audioIndex >= 0 ? readAudioManifest(JSON.parse(await fs.readFile(path.resolve(args[audioIndex + 1]), "utf8"))) : new Set();
const sourceDirectory = path.resolve(args[sourceIndex + 1]);
const mediaDirectory = mediaIndex >= 0 && args[mediaIndex + 1] ? await fs.realpath(path.resolve(args[mediaIndex + 1])) : null;
const outputDirectory = path.join(projectRoot, "src/data/imported-bank");
const generator = "jlpt-practice/import-question-bank/v1";
const manifestPath = path.join(outputDirectory, "index.json");
try {
  const previous = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (previous.generatedBy !== generator) throw new Error("Refusing to overwrite an unmanaged imported bank.");
} catch (error) { if (error.code !== "ENOENT") throw error; }
await fs.mkdir(path.join(outputDirectory, "questions"), { recursive: true });

const categories = { 1: "词汇", 2: "语法", 3: "阅读", 4: "听力" };
const typeNames = { 1: "vocabulary", 2: "grammar", 3: "reading", 4: "listening" };
const letters = ["A", "B", "C", "D"];
const report = { files: 0, sourceRecords: 0, containers: 0, questions: 0, available: 0, unavailable: 0, inheritedMetadata: 0, reasons: {}, errors: [] };
const groups = [];
const allIds = new Set();

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function visibleText(value) { return text(value).replace(/<[^>]*>/g, "").replace(/&nbsp;|\s+/g, " ").trim(); }

async function resolveMedia(reference, kind) {
  if (!reference) return null;
  if (kind === "audio") {
    if (isPublicAudioUrl(reference)) return reference;
    const key = getAudioObjectKey(reference);
    // No guessing from question numbers; only existing references confirmed by an upload.
    return key && uploadedAudio.has(key) ? key : null;
  }
  const relative = text(reference).replaceAll("\\", "/").replace(/^\.\//, "");
  if (!mediaDirectory || /^(?:[a-z]+:|\/)/i.test(relative) || relative.split("/").some((part) => part === ".." || part === "")) return null;
  const extensions = /\.(png|jpg|jpeg|webp|gif)$/i;
  if (!extensions.test(relative)) return null;
  try {
    const resolved = await fs.realpath(path.join(mediaDirectory, relative));
    if (!resolved.startsWith(mediaDirectory + path.sep) || !(await fs.stat(resolved)).isFile()) return null;
    const destination = path.join(projectRoot, "public/imported-media", relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(resolved, destination);
    return `/imported-media/${relative}`;
  } catch { return null; }
}

function explanationFor(row, parent) {
  const improved = text(row.assistantNew);
  // 一些子题把整组答案放在 assistantNew；优先提取当前题的段落，避免泄露后续题答案。
  if (parent && (improved.match(/<b>\s*\d+\s*<\/b>/g)?.length ?? 0) > 1) {
    const match = improved.match(new RegExp(`<b>\\s*${row.questionId}\\s*</b>([\\s\\S]*?)(?=<b>|$)`));
    if (match?.[1]) return match[1];
    if (text(row.assistant)) return row.assistant;
  }
  return improved || text(row.assistant) || text(parent?.assistantNew) || text(parent?.assistant) || "该题库未提供解析。";
}

for (const name of (await fs.readdir(sourceDirectory)).sort()) {
  const match = name.match(/^time_(\d{6})_level_(n[1-5])_type_([1-4])\.json$/i);
  if (!match) continue;
  report.files++;
  const [, period, rawLevel, rawType] = match;
  const level = rawLevel.toUpperCase();
  const type = Number(rawType);
  const file = `${period}-${level}-${type}.json`;
  const questions = [];
  const unavailable = [];
  let rows;
  try { rows = JSON.parse((await fs.readFile(path.join(sourceDirectory, name), "utf8")).replace(/^\uFEFF/, "")); }
  catch (error) { report.errors.push({ file: name, reason: error.message }); continue; }
  if (!Array.isArray(rows)) { report.errors.push({ file: name, reason: "Expected an array" }); continue; }

  async function visit(row, parent = null) {
    report.sourceRecords++;
    if (!row || typeof row !== "object" || Array.isArray(row)) { unavailable.push({ reason: "题目对象无效", raw: row }); return; }
    if (Array.isArray(row.extending) && row.extending.length > 0) {
      report.containers++;
      for (const child of row.extending) await visit(child, row);
      return;
    }
    const number = Number.isInteger(row.questionId) ? row.questionId : null;
    const id = `imported:${period}:${level}:${type}:${row.id}:${number ?? "single"}`;
    report.questions++;
    if (row.time == null || row.level == null) report.inheritedMetadata++;
    const reasons = [];
    if (!Number.isInteger(row.id) || allIds.has(id)) reasons.push("题目 ID 无效或重复");
    allIds.add(id);
    if (row.time != null && row.time !== period || row.level != null && String(row.level).toUpperCase() !== level || row.type != null && row.type !== type) reasons.push("文件与题目元数据不一致");

    const instruction = text(row.bigTitle) || text(parent?.bigTitle);
    let prompt = text(row.littleQuestion);
    let passage = "";
    if (parent) {
      passage = text(parent.question) || text(parent.article);
      prompt ||= text(row.question) || `请选择第 ${number ?? "当前"} 题的答案（对应文章或音频中的题号）。`;
    } else if (visibleText(row.littleQuestion)) {
      passage = text(row.article) || text(row.question);
    } else {
      prompt = text(row.question);
      passage = text(row.article);
    }
    if (!visibleText(prompt)) prompt = type === 4 ? `听力第 ${number ?? "当前"} 题：请听音频后选择答案。` : "";
    if (!prompt) reasons.push("题干缺失");
    const options = letters.flatMap((letter, index) => {
      const value = text(row[`option${index + 1}`]);
      return visibleText(value) ? [{ id: letter, label: String(index + 1), text: value }] : [];
    });
    // 无文字选项的听力题使用原题中的数字作答位置，不展示原文或译文。
    if (options.length === 0 && type === 4) {
      const directions = visibleText(instruction).normalize("NFKC").replaceAll(/\s/g, "");
      const optionCount = /1[・、]2[・、]3[・、]4|1(?:から|～|~|－|-)4/.test(directions) ? 4 : /1[・、]2[・、]3|1(?:から|～|~|－|-)3|三つ|3つ/.test(directions) ? 3 : 0;
      for (let index = 0; index < optionCount; index++) options.push({ id: letters[index], label: String(index + 1), text: `选项 ${index + 1}（以音频为准）` });
    }
    const answer = Number.isInteger(row.answer) && row.answer >= 1 && row.answer <= 4 ? letters[row.answer - 1] : null;
    if (options.length < 2 || !options.some((option) => option.id === answer)) reasons.push("选项或答案不完整");

    const pictureReference = text(row.picture) || text(parent?.picture);
    const audioReference = text(row.audio) || text(parent?.audio);
    const image = await resolveMedia(pictureReference, "image");
    const audio = await resolveMedia(audioReference, "audio");
    if (pictureReference && !image) reasons.push("缺少配套图片");
    if (type === 4 && !audio || audioReference && !audio) reasons.push("缺少配套音频");
    if (reasons.length > 0) {
      unavailable.push({ id, sourceId: row.id, questionNumber: number, reasons, media: { picture: pictureReference, audio: audioReference }, raw: row });
      for (const reason of reasons) report.reasons[reason] = (report.reasons[reason] ?? 0) + 1;
      return;
    }
    questions.push({ id, level, category: categories[type], prompt, ...(passage ? { passage } : {}), ...(instruction ? { instruction } : {}), richText: true, options, correctOptionId: answer, explanation: [explanationFor(row, parent)], sourceQuestionNumber: number, sourceId: row.id, ...(image || audio ? { media: { images: image ? [image] : [], ...(audio ? { audio } : {}) } } : {}) });
  }
  for (const row of rows) await visit(row);
  report.available += questions.length;
  report.unavailable += unavailable.length;
  await fs.writeFile(path.join(outputDirectory, "questions", file), JSON.stringify({ version: 1, sourceFile: name, period, level, type: typeNames[type], questions, unavailable }, null, 2) + "\n");
  groups.push({ level, period, type: typeNames[type], file, sourceFile: name, availableCount: questions.length, unavailableCount: unavailable.length, totalCount: questions.length + unavailable.length });
}
if (groups.length === 0 || report.available === 0) throw new Error("No usable question groups found. Manifest was not changed.");
await fs.writeFile(manifestPath, JSON.stringify({ version: 1, generatedBy: generator, sourceLabel: "用户提供题库", groups, report }, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
