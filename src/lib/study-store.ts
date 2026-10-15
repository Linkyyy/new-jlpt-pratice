"use client";

import { useSyncExternalStore } from "react";
import { isStudyData } from "./backup-validation";
export { isStudyData } from "./backup-validation";
import type { JLPTLevel, OptionId, QuestionCategory } from "@/data/practice-question";
import type { PracticePaper, QuestionType } from "@/data/practice-papers";
import type { PracticeMode } from "@/data/practice-modes";

export const STUDY_STORAGE_KEY = "jlpt-practice.study.v1";
export interface StudyQuestion {
  readonly id: string;
  readonly level: JLPTLevel;
  readonly category: QuestionCategory;
  readonly correctOptionId: OptionId;
  readonly optionIds: readonly OptionId[];
  readonly sourceQuestionNumber?: number | null;
}
export interface StudyAnswer { readonly selectedOptionId: OptionId; readonly submitted: boolean }
export interface StudyAttempt {
  readonly id: string;
  readonly paperId: string;
  readonly source: "original" | "imported" | "favorites";
  readonly level: JLPTLevel | "混合";
  readonly year: string;
  readonly type: QuestionType;
  readonly typeLabel: string;
  readonly periodLabel: string;
  readonly mode: PracticeMode;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
  readonly questions: readonly StudyQuestion[];
  readonly answers: Readonly<Partial<Record<string, StudyAnswer>>>;
  readonly status: "ready" | "active" | "completed";
  readonly questionIndex: number;
  readonly deadline: number | null;
  readonly elapsedSeconds: number;
  readonly timedOut: boolean;
  readonly fontSize: number;
  readonly mobileFontSize?: number;
}
export interface StudyData { readonly version: 1; readonly attempts: readonly StudyAttempt[]; readonly activityDays: readonly string[] }
interface StudySnapshot { readonly data: StudyData; readonly ready: boolean; readonly error: string | null }
export type StudyResult = { ok: true } | { ok: false; error: string };
export type StudyPatch = Pick<StudyAttempt, "status" | "questionIndex" | "deadline" | "elapsedSeconds" | "timedOut" | "fontSize" | "mobileFontSize"> & { answers: StudyAttempt["answers"] };

const empty: StudyData = { version: 1, attempts: [], activityDays: [] };
const serverSnapshot: StudySnapshot = { data: empty, ready: false, error: null };
let cachedRaw: string | null | undefined;
let cachedSnapshot = serverSnapshot;
const listeners = new Set<() => void>();
const types = ["all", "vocabulary", "grammar", "reading", "listening"];
export function studyDay(time = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
}
export function readStudySnapshot(): StudySnapshot {
  if (typeof window === "undefined") return serverSnapshot;
  try {
    const raw = window.localStorage.getItem(STUDY_STORAGE_KEY);
    if (raw === cachedRaw && cachedSnapshot.ready && !cachedSnapshot.error) return cachedSnapshot;
    const data: unknown = raw === null ? empty : JSON.parse(raw);
    if (!isStudyData(data)) throw new Error("Invalid study records");
    cachedRaw = raw;
    cachedSnapshot = { data, ready: true, error: null };
  } catch {
    if (!cachedSnapshot.ready || !cachedSnapshot.error) cachedSnapshot = { data: cachedSnapshot.data, ready: true, error: "无法读取本地学习记录，原数据未覆盖。请检查浏览器存储权限，并先备份现有数据。" };
  }
  return cachedSnapshot;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === STUDY_STORAGE_KEY || event.key === null) { cachedRaw = undefined; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function useStudyHistory() { return useSyncExternalStore(subscribe, readStudySnapshot, () => serverSnapshot); }
export function refreshStudyHistory() { cachedRaw = undefined; readStudySnapshot(); listeners.forEach(listener => listener()); }
function commit(update: (data: StudyData) => StudyData): StudyResult {
  const snapshot = readStudySnapshot();
  if (snapshot.error) return { ok: false, error: snapshot.error };
  try {
    const data = update(snapshot.data);
    if (data === snapshot.data) return { ok: true };
    if (!isStudyData(data)) return { ok: false, error: "学习记录无效，原数据未修改。" };
    window.localStorage.setItem(STUDY_STORAGE_KEY, JSON.stringify(data));
    cachedRaw = undefined;
    readStudySnapshot();
    listeners.forEach(listener => listener());
    return { ok: true };
  } catch { return { ok: false, error: "学习记录保存失败，请检查浏览器存储权限或空间。已有记录未修改。" }; }
}
export function createStudyAttempt(paper: PracticePaper, mode: PracticeMode) {
  const now = Date.now();
  const attempt: StudyAttempt = {
    id: globalThis.crypto?.randomUUID?.() ?? `study-${now.toString(36)}-${Math.random().toString(36).slice(2)}`,
    paperId: paper.id, source: paper.source ?? "original", level: paper.level, year: paper.year,
    type: (types.find(t => paper.id.endsWith(`-${t}`)) ?? "all") as QuestionType,
    typeLabel: paper.typeLabel, periodLabel: paper.periodLabel ?? `${paper.year} 原创版`, mode,
    createdAt: now, updatedAt: now, completedAt: null, status: mode === "exam" ? "ready" : "active",
    questionIndex: 0, answers: {}, deadline: null, elapsedSeconds: 0, timedOut: false, fontSize: 18, mobileFontSize: 16,
    questions: paper.questions.map(q => ({ id: q.id, level: q.level, category: q.category, correctOptionId: q.correctOptionId, optionIds: q.options.map(o => o.id), sourceQuestionNumber: q.sourceQuestionNumber })),
  };
  const result = commit(data => ({ ...data, attempts: [...data.attempts, attempt] }));
  return { attempt, error: result.ok ? null : result.error };
}
export function updateStudyAttempt(id: string, patch: StudyPatch): StudyResult {
  const snapshot = readStudySnapshot();
  const current = snapshot.data.attempts.find(a => a.id === id);
  if (snapshot.error) return { ok: false, error: snapshot.error };
  if (!current) return { ok: false, error: "找不到可保存的本地学习记录。请返回首页重新开始。" };
  if (current.status === "completed") {
    if (Object.entries(patch.answers).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(current.answers[key]))) return { ok: false, error: "这次作答已交卷，历史成绩不可修改。" };
    return { ok: true };
  }
  if (current.mode === "practice" && Object.entries(patch.answers).some(([key, answer]) => current.answers[key]?.submitted && answer && (answer.selectedOptionId !== current.answers[key]?.selectedOptionId || !answer.submitted))) return { ok: false, error: "这道题已在其他页面提交，请刷新以同步记录。" };
  return commit(data => {
    const latest = data.attempts.find(a => a.id === id)!;
    if (latest.status === "completed") return data;
    const answers = { ...latest.answers };
    for (const [key, answer] of Object.entries(patch.answers)) {
      if (answer && !(latest.mode === "practice" && answers[key]?.submitted)) answers[key] = answer;
    }
    const next: StudyAttempt = { ...latest, ...patch, answers, updatedAt: Math.max(Date.now(), latest.updatedAt), completedAt: patch.status === "completed" ? Math.max(Date.now(), latest.createdAt) : null };
    const meaningful = Object.keys(patch.answers).length > 0 || patch.status === "completed";
    return { ...data, attempts: data.attempts.map(a => a.id === id ? next : a), activityDays: meaningful ? [...new Set([...data.activityDays, studyDay()])].sort() : data.activityDays };
  });
}
export function matchesStudyPaper(attempt: StudyAttempt, paper: PracticePaper, mode: PracticeMode): boolean {
  return attempt.paperId === paper.id && attempt.mode === mode && attempt.questions.length === paper.questions.length && attempt.questions.every((q, i) => {
    const next = paper.questions[i];
    return q.id === next.id && q.correctOptionId === next.correctOptionId && q.optionIds.join() === next.options.map(o => o.id).join();
  });
}
export function latestStudyAttempt(data: StudyData, paperId?: string, mode?: PracticeMode) {
  return [...data.attempts].filter(a => a.status === "active" && (!paperId || a.paperId === paperId) && (!mode || a.mode === mode)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
export function studyAttemptUrl(attempt: StudyAttempt) {
  if (attempt.source === "favorites") return `/favorites/practice?attempt=${encodeURIComponent(attempt.id)}`;
  return `/practice?${new URLSearchParams({ source: attempt.source, level: attempt.level, year: attempt.year, type: attempt.type, mode: attempt.mode, attempt: attempt.id })}`;
}
export function studyScore(attempt: StudyAttempt) {
  let correct = 0, answered = 0;
  for (const q of attempt.questions) { const a = attempt.answers[q.id]; if (a?.submitted) { answered++; if (a.selectedOptionId === q.correctOptionId) correct++; } }
  return { total: attempt.questions.length, answered, correct, wrong: answered - correct, unanswered: attempt.questions.length - answered, percent: Math.round(correct / attempt.questions.length * 100) };
}
export function questionTrails(data: StudyData) {
  const trails = new Map<string, { correct: boolean; everCorrect: boolean; count: number; level: JLPTLevel; category: QuestionCategory }>();
  for (const attempt of [...data.attempts].sort((a, b) => a.createdAt - b.createdAt)) for (const q of attempt.questions) {
    const answer = attempt.answers[q.id];
    if (!answer?.submitted) continue;
    const prior = trails.get(q.id), correct = answer.selectedOptionId === q.correctOptionId;
    trails.set(q.id, { correct, everCorrect: correct || Boolean(prior?.everCorrect), count: (prior?.count ?? 0) + 1, level: q.level, category: q.category });
  }
  return trails;
}
export function studySummary(data: StudyData, now?: number) {
  const trails = questionTrails(data), completed = data.attempts.filter(a => a.status === "completed");
  let correct = 0, answered = 0;
  for (const a of data.attempts) { const score = studyScore(a); correct += score.correct; answered += score.answered; }
  const days = new Set(data.activityDays);
  let cursor = days.size ? Date.parse(`${studyDay(now ?? Date.now())}T00:00:00+09:00`) : 0, streak = 0;
  if (!days.has(studyDay(cursor))) cursor -= 86400000;
  while (days.has(studyDay(cursor))) { streak++; cursor -= 86400000; }
  let bestStreak = 0, run = 0, previous = 0;
  for (const day of [...days].sort()) { const time = Date.parse(day); run = time - previous === 86400000 ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); previous = time; }
  return { unique: trails.size, mastered: [...trails.values()].filter(q => q.everCorrect).length, completed: completed.length, correct, answered, accuracy: answered ? Math.round(correct / answered * 100) : 0, streak, bestStreak };
}
export function importStudyData(value: unknown): StudyResult {
  if (!isStudyData(value)) return { ok: false, error: "备份格式无效，原记录未修改。" };
  return commit(data => mergeStudyData(data, value));
}
export function mergeStudyData(data: StudyData, value: StudyData): StudyData {
  const attempts = new Map(data.attempts.map(a => [a.id, a]));
  for (const a of value.attempts) { const old = attempts.get(a.id); if (!old || old.status !== "completed" && a.updatedAt > old.updatedAt) attempts.set(a.id, a); }
  return { version: 1, attempts: [...attempts.values()], activityDays: [...new Set([...data.activityDays, ...value.activityDays])].sort() };
}
