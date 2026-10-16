"use client";

import { useSyncExternalStore } from "react";

export type Locale = "zh" | "ja" | "en";
export type Theme = "system" | "light" | "dark";
export interface DisplayPreferences { readonly locale: Locale; readonly theme: Theme }
export const DISPLAY_STORAGE_KEY = "jlpt-practice.display.v1";
export const defaultDisplay: DisplayPreferences = { locale: "zh", theme: "system" };
const listeners = new Set<() => void>();
let rawCache: string | null | undefined, snapshot = defaultDisplay;
export function parseDisplayPreferences(raw: string | null): DisplayPreferences {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return defaultDisplay;
    const v = value as Record<string, unknown>;
    return { locale: v.locale === "ja" || v.locale === "en" ? v.locale : "zh", theme: v.theme === "light" || v.theme === "dark" ? v.theme : "system" };
  } catch { return defaultDisplay; }
}
function read() {
  if (typeof window === "undefined") return defaultDisplay;
  try {
    const raw = window.localStorage.getItem(DISPLAY_STORAGE_KEY);
    if (raw !== rawCache) { rawCache = raw; snapshot = parseDisplayPreferences(raw); }
  } catch { /* Keep the current view usable when storage is unavailable. */ }
  return snapshot;
}
export const readDisplayPreferences = read;
export function refreshDisplayPreferences() { rawCache = undefined; read(); listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === DISPLAY_STORAGE_KEY || event.key === null) { rawCache = undefined; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function useDisplayPreferences() { return useSyncExternalStore(subscribe, read, () => defaultDisplay); }
export function setDisplayPreferences(patch: Partial<DisplayPreferences>): boolean {
  const next = { ...read(), ...patch };
  let saved = true;
  try { const raw = JSON.stringify(next); window.localStorage.setItem(DISPLAY_STORAGE_KEY, raw); rawCache = raw; }
  catch { saved = false; }
  snapshot = next;
  listeners.forEach(listener => listener());
  return saved;
}
