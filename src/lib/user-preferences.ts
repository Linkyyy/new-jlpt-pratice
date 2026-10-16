"use client";

import { useSyncExternalStore } from "react";
import { isUserPreferences } from "./backup-validation";
import type { JLPTLevel } from "@/data/practice-question";
import type { QuestionType } from "@/data/practice-papers";
import type { PracticeMode } from "@/data/practice-modes";

export type FavoriteSort = "recent" | "wrong" | "due" | "paper";
export interface UserPreferences {
  readonly version: 1;
  readonly home: { readonly source: "original" | "imported"; readonly level: JLPTLevel; readonly year: string; readonly type: QuestionType; readonly mode: PracticeMode };
  readonly practice: { readonly swipeEnabled: boolean; readonly buttonsEnabled: boolean; readonly keyboardEnabled: boolean; readonly instantFeedback: boolean; readonly fontSize: number; readonly mobileFontSize: number; readonly playbackRate: number };
  readonly favorites: { readonly mode: "preview" | "cards"; readonly fontSize: number; readonly sort: FavoriteSort; readonly mistakesSort: FavoriteSort; readonly dueSort: FavoriteSort };
}
export const PREFERENCES_STORAGE_KEY = "jlpt-practice.preferences.v1";
export const defaultPreferences: UserPreferences = {
  version: 1,
  home: { source: "imported", level: "N2", year: "", type: "all", mode: "practice" },
  practice: { swipeEnabled: true, buttonsEnabled: true, keyboardEnabled: true, instantFeedback: false, fontSize: 18, mobileFontSize: 16, playbackRate: 1 },
  favorites: { mode: "preview", fontSize: 16, sort: "recent", mistakesSort: "wrong", dueSort: "due" },
};
interface Snapshot { readonly data: UserPreferences; readonly ready: boolean; readonly error: string | null }
const serverSnapshot: Snapshot = { data: defaultPreferences, ready: false, error: null };
const invalid = "设置无法读取，已有数据未修改。", failed = "设置保存失败，请检查浏览器存储权限或空间。";
let cachedRaw: string | null | undefined, snapshot = serverSnapshot;
const listeners = new Set<() => void>();
export function readUserPreferences(): Snapshot {
  if (typeof window === "undefined") return serverSnapshot;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (snapshot.ready && raw === cachedRaw) return snapshot;
    cachedRaw = raw;
    const data: unknown = raw === null ? defaultPreferences : JSON.parse(raw);
    snapshot = isUserPreferences(data) ? { data, ready: true, error: null } : { data: snapshot.data, ready: true, error: invalid };
  } catch { if (!snapshot.ready || snapshot.error !== invalid) snapshot = { data: snapshot.data, ready: true, error: invalid }; }
  return snapshot;
}
export function refreshUserPreferences() {
  cachedRaw = undefined; readUserPreferences(); listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  function changed(event: StorageEvent) { if (event.key === PREFERENCES_STORAGE_KEY || event.key === null) refreshUserPreferences(); }
  window.addEventListener("storage", changed);
  return () => { listeners.delete(listener); window.removeEventListener("storage", changed); };
}
export function useUserPreferences() { return useSyncExternalStore(subscribe, readUserPreferences, () => serverSnapshot); }
export function setUserPreferences<K extends "home" | "practice" | "favorites">(section: K, patch: Partial<UserPreferences[K]>): boolean {
  const current = readUserPreferences();
  if (!current.ready || current.error === invalid) return false;
  const data = { ...current.data, [section]: { ...current.data[section], ...patch } };
  if (!isUserPreferences(data)) return false;
  try {
    const raw = JSON.stringify(data);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
    cachedRaw = raw; snapshot = { data, ready: true, error: null };
  } catch { snapshot = { ...current, error: failed }; }
  listeners.forEach(listener => listener());
  return snapshot.error === null;
}
