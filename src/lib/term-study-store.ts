"use client";
import { useSyncExternalStore } from "react";
import { isTermStudyData, termStudyKey, type TermIdentity, type TermStudyData, type TermStudyEntry } from "./term-study-data";
export const TERM_STUDY_STORAGE_KEY = "jlpt-practice.term-study.v1";
const empty: TermStudyData = {version: 1, entries: []};
type Snapshot = {data: TermStudyData; ready: boolean; error: string | null};
const server: Snapshot = {data: empty, ready: false, error: null};
let rawCache: string | null | undefined, cache = server;
const listeners = new Set<() => void>();
export function readTermStudySnapshot(): Snapshot {
  if (typeof window === "undefined") return server;
  try {
    const raw = window.localStorage.getItem(TERM_STUDY_STORAGE_KEY);
    if (raw === rawCache && cache.ready && !cache.error) return cache;
    const data: unknown = raw === null ? empty : JSON.parse(raw);
    if (!isTermStudyData(data)) throw new Error("Invalid term collection");
    rawCache = raw; cache = {data, ready: true, error: null};
  } catch { if (!cache.ready || !cache.error) cache = {data: cache.data, ready: true, error: "无法读取词条收藏，原数据未被覆盖，请检查浏览器存储权限。"}; }
  return cache;
}
export function refreshTermStudy() { rawCache = undefined; readTermStudySnapshot(); listeners.forEach(f => f()); }
function subscribe(f: () => void) {
  listeners.add(f);
  const storage = (e: StorageEvent) => { if (e.key === TERM_STUDY_STORAGE_KEY || e.key === null) { rawCache = undefined; f(); } };
  window.addEventListener("storage", storage);
  return () => { listeners.delete(f); window.removeEventListener("storage", storage); };
}
export function useTermStudy() { return useSyncExternalStore(subscribe, readTermStudySnapshot, () => server); }
export function updateTermStudy(term: TermIdentity & {meaning?: string; usage?: string}, action: "save" | "remove" | "pending" | "mastered"): {ok: boolean; error?: string} {
  const current = readTermStudySnapshot();
  if (!current.ready || current.error) return {ok: false, error: current.error ?? "正在读取本地记录，请稍后重试。"};
  const key = termStudyKey(term), old = current.data.entries.find(e => e.key === key), now = Math.max(Date.now(), (old?.updatedAt ?? 0) + 1);
  const entries = current.data.entries.filter(e => e.key !== key);
  if (action !== "remove") {
    if (action === "save" && old) return {ok: true};
    const review = action === "pending" || action === "mastered";
    entries.push({...term, key, meaning: (term.meaning ?? old?.meaning ?? "").slice(0, 2000), usage: (term.usage ?? old?.usage ?? "").slice(0, 2000), savedAt: old?.savedAt ?? now, updatedAt: now,
      reviewedAt: review ? now : old?.reviewedAt ?? null, reviews: (old?.reviews ?? 0) + (review ? 1 : 0), status: action === "mastered" ? "mastered" : "pending"} as TermStudyEntry);
  }
  const data: TermStudyData = {version: 1, entries};
  if (!isTermStudyData(data)) return {ok: false, error: "词条收藏操作无效，或已达到 5000 条收藏上限。"};
  try { window.localStorage.setItem(TERM_STUDY_STORAGE_KEY, JSON.stringify(data)); refreshTermStudy(); return {ok: true}; }
  catch { return {ok: false, error: "保存失败，请检查浏览器存储权限或空间。原收藏未修改。"}; }
}
