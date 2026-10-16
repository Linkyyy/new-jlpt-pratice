"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { StudyData } from "./study-store";

function subscribe(update: () => void) {
  const timer = window.setInterval(update, 60_000);
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", update);
  return () => { window.clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
}
function serverSnapshot() { return 0; }

/** A stable client clock; server and hydration use the same empty snapshot. */
export function useStudyClock(data?: StudyData) {
  const snapshot = useCallback(() => {
    const now = Date.now();
    // Include just-submitted answers immediately without an unstable Date.now snapshot.
    return Math.max(Math.floor(now / 60_000) * 60_000, ...(data?.attempts.map(attempt => attempt.updatedAt <= now ? attempt.updatedAt : 0) ?? []));
  }, [data]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
