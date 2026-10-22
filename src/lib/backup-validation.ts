import { isTermStudyData } from "./term-study-data";
import type { OptionId } from "@/data/practice-question";
import type { FavoriteFolder, FavoriteEntry, FavoritesData } from "./favorites-store";
import type { StudyQuestion, StudyAnswer, StudyAttempt, StudyData } from "./study-store";
import type { LearningBackup } from "./learning-backup";
import type { UserPreferences } from "./user-preferences";
import type { DisplayPreferences } from "./display-preferences";

// Pure validators shared by local import and the server; never read browser storage.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFolder(value: unknown): value is FavoriteFolder {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0
    && typeof value.name === "string" && value.name.trim() === value.name && value.name.length > 0 && value.name.length <= 40;
}

function isEntry(value: unknown): value is FavoriteEntry {
  return isRecord(value) && typeof value.questionId === "string" && value.questionId.length > 0
    && Array.isArray(value.folderIds) && value.folderIds.length > 0 && value.folderIds.every((id: unknown) => typeof id === "string")
    && new Set(value.folderIds).size === value.folderIds.length && typeof value.savedAt === "string" && Number.isFinite(Date.parse(value.savedAt));
}

export function isFavoritesData(value: unknown): value is FavoritesData {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.folders) || !Array.isArray(value.entries)) return false;
  const folders: unknown[] = value.folders;
  const entries: unknown[] = value.entries;
  if (!folders.every(isFolder) || !entries.every(isEntry)) return false;
  const ids = new Set(folders.map((folder) => folder.id));
  const names = new Set(folders.map((folder) => folder.name.toLocaleLowerCase()));
  return ids.has("default") && ids.size === folders.length && names.size === folders.length
    && new Set(entries.map((entry) => entry.questionId)).size === entries.length && entries.every((entry) => entry.folderIds.every((id) => ids.has(id)));
}

const optionIds = ["A", "B", "C", "D"];
const levels = ["N1", "N2", "N3", "N4", "N5"];
const categories = ["词汇", "语法", "阅读", "听力"];
const types = ["all", "vocabulary", "grammar", "reading", "listening"];
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 300;
const timestamp = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 8640000000000000;

function isQuestion(v: unknown): v is StudyQuestion {
  return record(v) && text(v.id) && levels.includes(String(v.level)) && categories.includes(String(v.category))
    && Array.isArray(v.optionIds) && v.optionIds.length >= 2 && v.optionIds.length <= 4 && v.optionIds.every(id => optionIds.includes(String(id)))
    && new Set(v.optionIds).size === v.optionIds.length && v.optionIds.includes(v.correctOptionId)
    && (v.sourceQuestionNumber === undefined || v.sourceQuestionNumber === null || Number.isSafeInteger(v.sourceQuestionNumber));
}
function isAttempt(v: unknown): v is StudyAttempt {
  if (!record(v) || !text(v.id) || !text(v.paperId) || !["original", "imported", "favorites"].includes(String(v.source))
    || ![...levels, "混合"].includes(String(v.level)) || !text(v.year) || !types.includes(String(v.type)) || !text(v.typeLabel) || !text(v.periodLabel)
    || !["practice", "exam"].includes(String(v.mode)) || !["ready", "active", "completed"].includes(String(v.status))
    || !timestamp(v.createdAt) || !timestamp(v.updatedAt) || v.updatedAt < v.createdAt || !(v.completedAt === null || timestamp(v.completedAt))
    || !Array.isArray(v.questions) || !v.questions.length || !v.questions.every(isQuestion) || new Set(v.questions.map(q => q.id)).size !== v.questions.length
    || !record(v.answers) || !Number.isSafeInteger(v.questionIndex) || Number(v.questionIndex) < 0 || Number(v.questionIndex) >= v.questions.length
    || !(v.deadline === null || timestamp(v.deadline)) || !Number.isSafeInteger(v.elapsedSeconds) || Number(v.elapsedSeconds) < 0
    || typeof v.timedOut !== "boolean" || !Number.isInteger(v.fontSize) || Number(v.fontSize) < 14 || Number(v.fontSize) > 28
    || v.mobileFontSize !== undefined && (!Number.isInteger(v.mobileFontSize) || Number(v.mobileFontSize) < 14 || Number(v.mobileFontSize) > 28)) return false;
  const questions = new Map((v.questions as StudyQuestion[]).map(q => [q.id, q]));
  if (!Object.entries(v.answers).every(([id, a]) => record(a) && typeof a.submitted === "boolean" && questions.get(id)?.optionIds.includes(a.selectedOptionId as OptionId)
    && (a.submittedAt === undefined || a.submitted && timestamp(a.submittedAt) && a.submittedAt >= Number(v.createdAt) && a.submittedAt <= Number(v.updatedAt)))) return false;
  if (v.status === "completed" && (!timestamp(v.completedAt) || v.completedAt < v.createdAt || v.deadline !== null)) return false;
  if (v.status !== "completed" && v.completedAt !== null) return false;
  if (v.mode === "exam" && v.status === "active" && v.deadline === null) return false;
  if (v.mode === "practice" && (v.status === "ready" || v.deadline !== null)) return false;
  if (v.mode === "exam" && v.status !== "completed" && Object.values(v.answers).some(a => (a as StudyAnswer).submitted)) return false;
  if (v.status === "completed" && (Object.values(v.answers).some(a => !(a as StudyAnswer).submitted) || v.mode === "practice" && Object.keys(v.answers).length !== v.questions.length)) return false;
  return true;
}
export function isStudyData(v: unknown): v is StudyData {
  return record(v) && v.version === 1 && Array.isArray(v.attempts) && v.attempts.every(isAttempt)
    && new Set(v.attempts.map(a => a.id)).size === v.attempts.length && Array.isArray(v.activityDays)
    && v.activityDays.every(day => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day) && new Set(v.activityDays).size === v.activityDays.length;
}
export function isLearningBackup(value: unknown): value is LearningBackup {
  return isRecord(value) && value.format === "jlpt-practice-backup" && value.version === 1
    && typeof value.exportedAt === "string" && Number.isFinite(Date.parse(value.exportedAt))
    && isFavoritesData(value.favorites) && isStudyData(value.study)
    && (value.terms === undefined || isTermStudyData(value.terms))
    && (value.preferences === undefined || isUserPreferences(value.preferences))
    && (value.display === undefined || isDisplayPreferences(value.display));
}

export function isDisplayPreferences(value: unknown): value is DisplayPreferences {
  return isRecord(value) && ["zh", "ja", "en"].includes(String(value.locale)) && ["system", "light", "dark"].includes(String(value.theme));
}
export function isUserPreferences(value: unknown): value is UserPreferences {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.home) || !isRecord(value.practice) || !isRecord(value.favorites)) return false;
  const { home, practice, favorites } = value;
  const size = (n: unknown) => Number.isInteger(n) && Number(n) >= 14 && Number(n) <= 28;
  return ["original", "imported"].includes(String(home.source)) && levels.includes(String(home.level))
    && typeof home.year === "string" && /^(?:|\d{4}|\d{6}|random)$/.test(home.year) && types.includes(String(home.type))
    && (home.year !== "random" || home.type !== "all") && ["practice", "exam"].includes(String(home.mode))
    && ["swipeEnabled", "buttonsEnabled", "keyboardEnabled", "instantFeedback"].every(key => typeof practice[key] === "boolean")
    && size(practice.fontSize) && size(practice.mobileFontSize) && [0.75, 1, 1.25, 1.5].includes(practice.playbackRate as number)
    && ["preview", "cards"].includes(String(favorites.mode)) && size(favorites.fontSize)
    && ["sort", "mistakesSort", "dueSort"].every(key => ["recent", "wrong", "due", "paper"].includes(String(favorites[key])))
    && (value.frequency === undefined || isRecord(value.frequency) && typeof value.frequency.examplesExpanded === "boolean" && typeof value.frequency.previewsExpanded === "boolean");
}
