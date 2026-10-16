import manifest from "./imported-bank/index.json";
import { levels, type JLPTLevel } from "./practice-question";
import { questionTypes, years, type QuestionType } from "./practice-papers";
import { isRandomPeriod } from "./random-practice";

export type QuestionBankSource = "original" | "imported";
export const bankSources = [
  { value: "imported", label: "用户提供题库" },
  { value: "original", label: "原创模拟题库" },
] as const;

export function formatPeriod(period: string): string {
  if (isRandomPeriod(period)) return "随机练习";
  return /^\d{6}$/.test(period) ? `${period.slice(0, 4)}年${Number(period.slice(4))}月` : `${period} 原创版`;
}

export function getBankLevels(source: QuestionBankSource): readonly JLPTLevel[] {
  return source === "original" ? levels : levels.filter((level) => manifest.groups.some((group) => group.level === level));
}

export function getBankPeriods(source: QuestionBankSource, level: JLPTLevel): readonly string[] {
  return source === "original" ? years : [...new Set(manifest.groups.filter((group) => group.level === level).map((group) => group.period))].sort().reverse();
}

export function getBankCount(source: QuestionBankSource, level: JLPTLevel, period: string, type: QuestionType): { available: number; excluded: number } {
  if (isRandomPeriod(period)) {
    const counts = getBankPeriods(source, level).map(period => getBankCount(source, level, period, type));
    return { available: counts.reduce((sum, count) => sum + count.available, 0), excluded: counts.reduce((sum, count) => sum + count.excluded, 0) };
  }
  if (source === "original") return { available: type === "listening" ? 0 : type === "all" ? 9 : 3, excluded: 0 };
  const groups = manifest.groups.filter((group) => group.level === level && group.period === period && (type === "all" || group.type === type));
  return { available: groups.reduce((sum, group) => sum + group.availableCount, 0), excluded: groups.reduce((sum, group) => sum + group.unavailableCount, 0) };
}

export function getImportedGroup(level: JLPTLevel, period: string, type: QuestionType) {
  return manifest.groups.find((group) => group.level === level && group.period === period && group.type === type);
}

export function isQuestionType(value: unknown): value is QuestionType {
  return questionTypes.some((type) => type.value === value);
}

export const importedBankSummary = { files: manifest.report.files, available: manifest.report.available, unavailable: manifest.report.unavailable };
