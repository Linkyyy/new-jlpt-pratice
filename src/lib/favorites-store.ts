"use client";

import { useSyncExternalStore } from "react";

export const FAVORITES_STORAGE_KEY = "jlpt-practice.favorites.v1";
export const DEFAULT_FOLDER_ID = "default";

export interface FavoriteFolder {
  readonly id: string;
  readonly name: string;
}

export interface FavoriteEntry {
  readonly questionId: string;
  readonly folderId: string;
  readonly savedAt: string;
}

export interface FavoritesData {
  readonly version: 1;
  readonly folders: readonly FavoriteFolder[];
  readonly entries: readonly FavoriteEntry[];
}

interface FavoritesSnapshot {
  readonly data: FavoritesData;
  readonly ready: boolean;
  readonly error: string | null;
}

export type FavoriteActionResult = { readonly ok: true; readonly folderId?: string } | { readonly ok: false; readonly error: string };

const emptyData: FavoritesData = { version: 1, folders: [{ id: DEFAULT_FOLDER_ID, name: "默认收藏夹" }], entries: [] };
const serverSnapshot: FavoritesSnapshot = { data: emptyData, ready: false, error: null };
let cachedRaw: string | null | undefined;
let cachedSnapshot = serverSnapshot;
const listeners = new Set<() => void>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFolder(value: unknown): value is FavoriteFolder {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0
    && typeof value.name === "string" && value.name.trim() === value.name && value.name.length > 0 && value.name.length <= 40;
}

function isEntry(value: unknown): value is FavoriteEntry {
  return isRecord(value) && typeof value.questionId === "string" && value.questionId.length > 0
    && typeof value.folderId === "string" && typeof value.savedAt === "string" && Number.isFinite(Date.parse(value.savedAt));
}

export function isFavoritesData(value: unknown): value is FavoritesData {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.folders) || !Array.isArray(value.entries)) return false;
  const folders: unknown[] = value.folders;
  const entries: unknown[] = value.entries;
  if (!folders.every(isFolder) || !entries.every(isEntry)) return false;
  const ids = new Set(folders.map((folder) => folder.id));
  const names = new Set(folders.map((folder) => folder.name.toLocaleLowerCase()));
  return ids.has(DEFAULT_FOLDER_ID) && ids.size === folders.length && names.size === folders.length
    && new Set(entries.map((entry) => entry.questionId)).size === entries.length && entries.every((entry) => ids.has(entry.folderId));
}

function getSnapshot(): FavoritesSnapshot {
  if (typeof window === "undefined") return serverSnapshot;
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw === cachedRaw && cachedSnapshot.ready && cachedSnapshot.error === null) return cachedSnapshot;
    let data: FavoritesData = emptyData;
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (!isFavoritesData(parsed)) throw new Error("Invalid favorite data");
      data = parsed;
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
    entries: data.entries.map((entry) => entry.folderId === folderId ? { ...entry, folderId: DEFAULT_FOLDER_ID } : entry),
  }));
}

export function saveFavorite(questionId: string, folderId: string, newFolderName?: string): FavoriteActionResult {
  const snapshot = getSnapshot();
  const name = newFolderName?.trim();
  if (name !== undefined) {
    const error = folderNameError(name, snapshot.data);
    if (error) return { ok: false, error };
  } else if (!snapshot.data.folders.some((folder) => folder.id === folderId)) return { ok: false, error: "收藏夹已不存在，请重新选择。" };
  const targetId = name === undefined ? folderId : createFolderId();
  return commit((data) => {
    const previous = data.entries.find((entry) => entry.questionId === questionId);
    return {
      ...data,
      folders: name === undefined ? data.folders : [...data.folders, { id: targetId, name }],
      entries: [...data.entries.filter((entry) => entry.questionId !== questionId), { questionId, folderId: targetId, savedAt: previous?.savedAt ?? new Date().toISOString() }],
    };
  });
}

export function removeFavorite(questionId: string): FavoriteActionResult {
  return commit((data) => ({ ...data, entries: data.entries.filter((entry) => entry.questionId !== questionId) }));
}
