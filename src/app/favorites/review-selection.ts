import type { FavoriteEntry, FavoritesData } from "@/lib/favorites-store";
import type { QuestionInsight } from "@/lib/study-insights";

export type CollectionView = "favorites" | "mistakes" | "due";

export function collectionView(value: unknown): CollectionView {
  return value === "mistakes" || value === "due" ? value : "favorites";
}

/** Derive review entries from study history without adding them to favorites. */
export function collectionEntries(favorites: FavoritesData, insights: ReadonlyMap<string, QuestionInsight>, view: CollectionView, now: number): readonly FavoriteEntry[] {
  if (view === "favorites") return favorites.entries;
  const saved = new Map(favorites.entries.map(entry => [entry.questionId, entry]));
  return [...insights.values()]
    .filter(item => item.wrongCount > 0 && (view !== "due" || item.dueAt <= now))
    .sort((a, b) => view === "due" ? a.dueAt - b.dueAt || b.wrongCount - a.wrongCount || a.questionId.localeCompare(b.questionId) : b.wrongCount - a.wrongCount || b.lastAnsweredAt - a.lastAnsweredAt || a.questionId.localeCompare(b.questionId))
    .map(item => saved.get(item.questionId) ?? { questionId: item.questionId, folderIds: [], savedAt: new Date(item.lastAnsweredAt).toISOString() });
}

/** A running exercise snapshots IDs, then the server resolves only known questions. */
export function collectionPracticeIds(entries: readonly FavoriteEntry[], view: CollectionView, folderId: string, questionId?: string): string[] {
  return [...new Set(entries.filter(entry => (view !== "favorites" || folderId === "all" || entry.folderIds.includes(folderId)) && (!questionId || entry.questionId === questionId)).map(entry => entry.questionId))];
}
