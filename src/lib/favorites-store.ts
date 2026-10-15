"use client";

import { useSyncExternalStore } from "react";
import { isRecord, isFavoritesData } from "./backup-validation";
export { isFavoritesData } from "./backup-validation";

export const FAVORITES_STORAGE_KEY = "jlpt-practice.favorites.v1";
export const DEFAULT_FOLDER_ID = "default";

export interface FavoriteFolder {
  readonly id: string;
  readonly name: string;
}

export interface FavoriteEntry {
  readonly questionId: string;
  readonly folderIds: readonly string[];
  readonly savedAt: string;
}

export interface FavoritesData {
  readonly version: 2;
  readonly folders: readonly FavoriteFolder[];
  readonly entries: readonly FavoriteEntry[];
}

interface FavoritesSnapshot {
  readonly data: FavoritesData;
  readonly ready: boolean;
  readonly error: string | null;
}

export type FavoriteActionResult = { readonly ok: true; readonly folderId?: string; readonly addedCount?: number } | { readonly ok: false; readonly error: string };

const emptyData: FavoritesData = { version: 2, folders: [{ id: DEFAULT_FOLDER_ID, name: "默认收藏夹" }], entries: [] };
const serverSnapshot: FavoritesSnapshot = { data: emptyData, ready: false, error: null };
let cachedRaw: string | null | undefined;
let cachedSnapshot = serverSnapshot;
const listeners = new Set<() => void>();

// Read version 1 without modifying storage; the next successful save persists version 2.
function readFavoritesData(value: unknown): FavoritesData | null {
  if (isFavoritesData(value)) return value;
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) return null;
  const entries: unknown[] = value.entries;
  if (!entries.every((entry) => isRecord(entry) && typeof entry.folderId === "string")) return null;
  const migrated: unknown = { ...value, version: 2, entries: entries.map((entry) => {
    const { folderId, ...rest } = entry as Record<string, unknown>;
    return { ...rest, folderIds: [folderId] };
  }) };
  return isFavoritesData(migrated) ? migrated : null;
}

function getSnapshot(): FavoritesSnapshot {
  if (typeof window === "undefined") return serverSnapshot;
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw === cachedRaw && cachedSnapshot.ready && cachedSnapshot.error === null) return cachedSnapshot;
    let data: FavoritesData = emptyData;
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      const loaded = readFavoritesData(parsed);
      if (!loaded) throw new Error("Invalid favorite data");
      data = loaded;
    }
    cachedRaw = raw;
    cachedSnapshot = { data, ready: true, error: null };
  } catch {
    if (cachedSnapshot.error === null || !cachedSnapshot.ready) {
      cachedSnapshot = { data: cachedSnapshot.data, ready: true, error: "无法读取本地收藏。原数据未被覆盖，请检查浏览器存储权限或本地数据后重试。" };
    }
  }
  return cachedSnapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  function handleStorage(event: StorageEvent) {
    if (event.key === FAVORITES_STORAGE_KEY || event.key === null) {
      cachedRaw = undefined;
      listener();
    }
  }
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useFavorites(): FavoritesSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}

export { getSnapshot as readFavoritesSnapshot };
export function refreshFavorites() {
  cachedRaw = undefined;
  getSnapshot();
  listeners.forEach(listener => listener());
}

/** Merge folders by name, remapping colliding IDs without changing local folders. */
export function mergeFavoritesData(local: FavoritesData, incoming: FavoritesData): FavoritesData {
  const folders = [...local.folders];
  const folderIds = new Map<string, string>([[DEFAULT_FOLDER_ID, DEFAULT_FOLDER_ID]]);
  for (const folder of incoming.folders) {
    if (folder.id === DEFAULT_FOLDER_ID) continue;
    const named = folders.find(item => item.name.toLocaleLowerCase() === folder.name.toLocaleLowerCase());
    let id = named?.id ?? folder.id;
    if (!named && folders.some(item => item.id === id)) {
      do { id = createFolderId(); } while (folders.some(item => item.id === id));
    }
    if (!named) folders.push({ id, name: folder.name });
    folderIds.set(folder.id, id);
  }
  const entries = new Map(local.entries.map(entry => [entry.questionId, entry]));
  for (const entry of incoming.entries) {
    const old = entries.get(entry.questionId);
    entries.set(entry.questionId, {
      questionId: entry.questionId,
      folderIds: [...new Set([...(old?.folderIds ?? []), ...entry.folderIds.map(id => folderIds.get(id)!)])],
      savedAt: old && Date.parse(old.savedAt) < Date.parse(entry.savedAt) ? old.savedAt : entry.savedAt,
    });
  }
  return { version: 2, folders, entries: [...entries.values()] };
}

function commit(update: (data: FavoritesData) => FavoritesData): FavoriteActionResult {
  const snapshot = getSnapshot();
  if (snapshot.error) return { ok: false, error: snapshot.error };
  try {
    const data = update(snapshot.data);
    if (!isFavoritesData(data)) return { ok: false, error: "收藏操作无效，原数据未修改。" };
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(data));
    cachedRaw = undefined;
    getSnapshot();
    listeners.forEach((listener) => listener());
    return { ok: true };
  } catch {
    return { ok: false, error: "保存失败，请检查浏览器存储权限或空间。原收藏未修改。" };
  }
}

function folderNameError(name: string, data: FavoritesData, exceptId?: string): string | null {
  if (name.length === 0 || name.length > 40) return "收藏夹名称需要 1–40 个字符。";
  if (data.folders.some((folder) => folder.id !== exceptId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return "这个收藏夹名称已存在。";
  return null;
}

function createFolderId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createFolder(inputName: string): FavoriteActionResult {
  const name = inputName.trim();
  const snapshot = getSnapshot();
  const error = folderNameError(name, snapshot.data);
  if (error) return { ok: false, error };
  const id = createFolderId();
  const result = commit((data) => ({ ...data, folders: [...data.folders, { id, name }] }));
  return result.ok ? { ok: true, folderId: id } : result;
}

export function renameFolder(folderId: string, inputName: string): FavoriteActionResult {
  const name = inputName.trim();
  const snapshot = getSnapshot();
  if (folderId === DEFAULT_FOLDER_ID) return { ok: false, error: "默认收藏夹不能重命名。" };
  if (!snapshot.data.folders.some((folder) => folder.id === folderId)) return { ok: false, error: "收藏夹已不存在。" };
  const error = folderNameError(name, snapshot.data, folderId);
  if (error) return { ok: false, error };
  return commit((data) => ({ ...data, folders: data.folders.map((folder) => folder.id === folderId ? { ...folder, name } : folder) }));
}

export function deleteFolder(folderId: string): FavoriteActionResult {
  if (folderId === DEFAULT_FOLDER_ID) return { ok: false, error: "默认收藏夹不能删除。" };
  return commit((data) => ({
    ...data,
    folders: data.folders.filter((folder) => folder.id !== folderId),
    entries: data.entries.map((entry) => {
      const remaining = entry.folderIds.filter((id) => id !== folderId);
      return { ...entry, folderIds: remaining.length ? remaining : [DEFAULT_FOLDER_ID] };
    }),
  }));
}

export function saveFavorite(questionId: string, folderIds: readonly string[], newFolderName?: string): FavoriteActionResult {
  const snapshot = getSnapshot();
  if (snapshot.error) return { ok: false, error: snapshot.error };
  const name = newFolderName?.trim();
  if (name !== undefined) {
    const error = folderNameError(name, snapshot.data);
    if (error) return { ok: false, error };
  }
  if (!folderIds.every((id) => snapshot.data.folders.some((folder) => folder.id === id))) return { ok: false, error: "收藏夹已不存在，请重新选择。" };
  if (folderIds.length === 0 && name === undefined) return { ok: false, error: "请至少选择一个收藏夹，或使用取消收藏。" };
  const newId = name === undefined ? null : createFolderId();
  const targetIds = [...new Set([...folderIds, ...(newId ? [newId] : [])])];
  return commit((data) => {
    const previous = data.entries.find((entry) => entry.questionId === questionId);
    return {
      ...data,
      folders: newId === null ? data.folders : [...data.folders, { id: newId, name: name! }],
      entries: [...data.entries.filter((entry) => entry.questionId !== questionId), { questionId, folderIds: targetIds, savedAt: previous?.savedAt ?? new Date().toISOString() }],
    };
  });
}

/** Add only new questions in one storage write, preserving existing folder memberships. */
export function saveFavorites(questionIds: readonly string[]): FavoriteActionResult {
  let addedCount = 0;
  const result = commit((data) => {
    const existing = new Set(data.entries.map((entry) => entry.questionId));
    const savedAt = new Date().toISOString();
    const additions = [...new Set(questionIds)].filter((id) => !existing.has(id)).map((questionId) => ({ questionId, folderIds: [DEFAULT_FOLDER_ID], savedAt }));
    addedCount = additions.length;
    return { ...data, entries: [...data.entries, ...additions] };
  });
  return result.ok ? { ok: true, addedCount } : result;
}

export function removeFavorite(questionId: string): FavoriteActionResult {
  return commit((data) => ({ ...data, entries: data.entries.filter((entry) => entry.questionId !== questionId) }));
}
