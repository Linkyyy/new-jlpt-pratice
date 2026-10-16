import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { formatPeriod, getBankPeriods, getImportedGroup } from "./bank-catalog";
import { isRandomPeriod, RANDOM_PERIOD, selectRandomQuestions } from "./random-practice";
import { getPracticePaper, getQuestionCatalog, questionTypes, type CatalogQuestion, type PracticePaper, type QuestionType } from "./practice-papers";
import { levels, type JLPTLevel, type PracticeQuestion } from "./practice-question";
import { isPracticeQuestion, isRecord } from "./question-validation";

const readGroup = cache(async (level: JLPTLevel, period: string, type: QuestionType): Promise<readonly PracticeQuestion[]> => {
  const group = getImportedGroup(level, period, type);
  if (!group) return [];
  if (!/^\d{6}-N[1-5]-[1-4]\.json$/.test(group.file)) throw new Error("Invalid imported filename");
  const input: unknown = JSON.parse(await fs.readFile(path.join(process.cwd(), "src/data/imported-bank/questions", group.file), "utf8"));
  if (!isRecord(input) || !Array.isArray(input.questions)) throw new Error("Invalid imported group");
  const questions: unknown[] = input.questions;
  if (!questions.every(isPracticeQuestion) || questions.length !== group.availableCount || questions.some((question) => question.level !== level)) throw new Error("Invalid imported question data");
  return questions;
});

export async function loadPracticePaper(source: "original" | "imported", level: JLPTLevel, period: string, type: QuestionType): Promise<PracticePaper> {
  if (isRandomPeriod(period)) {
    if (period === RANDOM_PERIOD || type === "all") throw new Error("Random practice requires a seed and a single category");
    const papers = await Promise.all(getBankPeriods(source, level).map(period => loadPracticePaper(source, level, period, type)));
    return { id: `${source === "imported" ? "imported-" : ""}${level}-${period}-${type}`, source, level, year: period,
      typeLabel: questionTypes.find(item => item.value === type)!.label, periodLabel: "随机练习",
      sourceLabel: source === "imported" ? "用户提供题库" : "原创模拟题库", excludedCount: 0,
      questions: selectRandomQuestions(papers.flatMap(paper => paper.questions), period) };
  }
  if (source === "original") return { ...getPracticePaper(level, period, type), source, periodLabel: formatPeriod(period), sourceLabel: "原创模拟题库", excludedCount: 0 };
  const selectedTypes: readonly Exclude<QuestionType, "all">[] = type === "all" ? ["vocabulary", "grammar", "reading", "listening"] : [type];
  const questions = (await Promise.all(selectedTypes.map((selectedType) => readGroup(level, period, selectedType)))).flat();
  const excludedCount = selectedTypes.reduce((sum, selectedType) => sum + (getImportedGroup(level, period, selectedType)?.unavailableCount ?? 0), 0);
  return { id: `imported-${level}-${period}-${type}`, level, year: period, typeLabel: questionTypes.find((item) => item.value === type)?.label ?? type, source, periodLabel: formatPeriod(period), sourceLabel: "用户提供题库", questions, excludedCount };
}

export async function loadFavoriteQuestions(ids: readonly string[]): Promise<readonly CatalogQuestion[]> {
  const originals = new Map(getQuestionCatalog().map((item) => [item.question.id, item]));
  const result: CatalogQuestion[] = [];
  const loadedGroups = new Map<string, Promise<readonly PracticeQuestion[]>>();
  for (const id of ids) {
    const original = originals.get(id);
    if (original) { result.push({ ...original, source: "original" }); continue; }
    const match = id.match(/^imported:(\d{6}):(N[1-5]):([1-4]):\d+:(?:\d+|single)$/);
    if (!match) continue;
    const level = levels.find((level) => level === match[2]);
    const type = questionTypes[Number(match[3])]?.value;
    if (!level || !type) continue;
    const key = `${level}-${match[1]}-${type}`;
    if (!loadedGroups.has(key)) loadedGroups.set(key, readGroup(level, match[1], type));
    const question = (await loadedGroups.get(key))?.find((question) => question.id === id);
    if (question) result.push({ question, year: match[1], source: "imported" });
  }
  return result;
}
