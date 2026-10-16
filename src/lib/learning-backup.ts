"use client";

import { isLearningBackup } from "./backup-validation";
import { FAVORITES_STORAGE_KEY, isFavoritesData, mergeFavoritesData, readFavoritesSnapshot, refreshFavorites, type FavoritesData } from "./favorites-store";
import { STUDY_STORAGE_KEY, isStudyData, mergeStudyData, readStudySnapshot, refreshStudyHistory, type StudyData, type StudyResult } from "./study-store";
import { PREFERENCES_STORAGE_KEY, readUserPreferences, refreshUserPreferences, type UserPreferences } from "./user-preferences";
import { DISPLAY_STORAGE_KEY, readDisplayPreferences, refreshDisplayPreferences, type DisplayPreferences } from "./display-preferences";

export interface LearningBackup {
  readonly format: "jlpt-practice-backup";
  readonly version: 1;
  readonly exportedAt: string;
  readonly favorites: FavoritesData;
  readonly study: StudyData;
  readonly preferences?: UserPreferences;
  readonly display?: DisplayPreferences;
}
export function createLearningBackup(): { ok: true; data: LearningBackup } | { ok: false; error: string } {
  const favorites = readFavoritesSnapshot(), study = readStudySnapshot();
  if (!favorites.ready || !study.ready || favorites.error || study.error) return { ok: false, error: favorites.error ?? study.error ?? "正在读取本地记录，请稍后重试。" };
  const preferences = readUserPreferences();
  if (!preferences.ready || preferences.error) return { ok: false, error: preferences.error ?? "正在读取本地记录，请稍后重试。" };
  return { ok: true, data: { format: "jlpt-practice-backup", version: 1, exportedAt: new Date().toISOString(), favorites: favorites.data, study: study.data, preferences: preferences.data, display: readDisplayPreferences() } };
}
function backupParts(value: unknown): { favorites?: FavoritesData; study?: StudyData; preferences?: UserPreferences; display?: DisplayPreferences } | null {
  // Keep accepting the study-only files exported by earlier versions.
  if (isStudyData(value)) return { study: value };
  if (isFavoritesData(value)) return { favorites: value };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return isLearningBackup(value) ? { favorites: value.favorites, study: value.study, preferences: value.preferences, display: value.display } : null;
}
export function importLearningBackup(value: unknown): StudyResult {
  const incoming = backupParts(value);
  if (!incoming) return { ok: false, error: "备份格式无效，收藏和学习记录均未修改。" };
  const favorites = readFavoritesSnapshot(), study = readStudySnapshot();
  if (incoming.favorites && favorites.error || incoming.study && study.error) return { ok: false, error: favorites.error ?? study.error! };
  const writes: { key: string; value: string; old: string | null }[] = [];
  const written: typeof writes = [];
  try {
    if (incoming.favorites) writes.push({ key: FAVORITES_STORAGE_KEY, value: JSON.stringify(mergeFavoritesData(favorites.data, incoming.favorites)), old: window.localStorage.getItem(FAVORITES_STORAGE_KEY) });
    if (incoming.study) writes.push({ key: STUDY_STORAGE_KEY, value: JSON.stringify(mergeStudyData(study.data, incoming.study)), old: window.localStorage.getItem(STUDY_STORAGE_KEY) });
    if (incoming.preferences) writes.push({ key: PREFERENCES_STORAGE_KEY, value: JSON.stringify(incoming.preferences), old: window.localStorage.getItem(PREFERENCES_STORAGE_KEY) });
    if (incoming.display) writes.push({ key: DISPLAY_STORAGE_KEY, value: JSON.stringify(incoming.display), old: window.localStorage.getItem(DISPLAY_STORAGE_KEY) });
    for (const write of writes) { window.localStorage.setItem(write.key, write.value); written.push(write); }
  } catch {
    let restored = true;
    for (const write of written.reverse()) {
      try { if (write.old === null) window.localStorage.removeItem(write.key); else window.localStorage.setItem(write.key, write.old); }
      catch { restored = false; }
    }
    refreshFavorites(); refreshStudyHistory(); refreshUserPreferences(); refreshDisplayPreferences();
    return { ok: false, error: restored ? "导入失败，请检查浏览器存储空间或权限。原收藏和学习记录已保留。" : "导入未完成，且浏览器阻止了恢复操作。部分记录可能已导入，请保留备份文件并检查存储权限。" };
  }
  refreshFavorites(); refreshStudyHistory(); refreshUserPreferences(); refreshDisplayPreferences();
  return { ok: true };
}
