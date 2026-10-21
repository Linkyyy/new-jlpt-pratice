export const termKinds = ["word", "grammar", "idiom"] as const;
export type TermKind = typeof termKinds[number];
export type TermIdentity = { kind: TermKind; label: string; reading: string; pos: string };
export type TermStudyEntry = TermIdentity & { key: string; meaning: string; usage: string; savedAt: number; updatedAt: number; reviewedAt: number | null; reviews: number; status: "pending" | "mastered" };
export type TermStudyData = { version: 1; entries: TermStudyEntry[] };
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number, empty = false): v is string => typeof v === "string" && v.length <= max && (empty || v.trim().length > 0);
const timestamp = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 8640000000000000;
export function isTermIdentity(v: unknown): v is TermIdentity & Record<string, unknown> {
  return record(v) && termKinds.includes(v.kind as TermKind) && text(v.label, 120) && text(v.reading, 240, true) && text(v.pos, 40);
}
// Persist semantic identities, never build-specific numeric term IDs.
export function termStudyKey(term: TermIdentity): string {
  return JSON.stringify([term.kind, term.label.normalize("NFKC"), term.reading.normalize("NFKC"), term.pos]);
}
export function parseTermStudyKey(key: unknown): TermIdentity | null {
  if (typeof key !== "string" || key.length > 1000) return null;
  try { const values = JSON.parse(key); if (!Array.isArray(values) || values.length !== 4) return null; const term = {kind: values[0], label: values[1], reading: values[2], pos: values[3]}; return isTermIdentity(term) && termStudyKey(term) === key ? term : null; } catch { return null; }
}
export function isTermStudyData(v: unknown): v is TermStudyData {
  return record(v) && v.version === 1 && Array.isArray(v.entries) && v.entries.length <= 5000 && v.entries.every(e => isTermIdentity(e) && record(e) && e.key === termStudyKey(e)
    && text(e.meaning, 2000, true) && text(e.usage, 2000, true) && timestamp(e.savedAt) && timestamp(e.updatedAt) && Number(e.updatedAt) >= Number(e.savedAt)
    && ["pending", "mastered"].includes(String(e.status)) && Number.isSafeInteger(e.reviews) && Number(e.reviews) >= 0 && Number(e.reviews) <= 1000000
    && (e.reviewedAt === null || timestamp(e.reviewedAt) && Number(e.reviewedAt) >= Number(e.savedAt) && Number(e.reviewedAt) <= Number(e.updatedAt)))
    && new Set(v.entries.map(e => e.key)).size === v.entries.length;
}
export function mergeTermStudyData(local: TermStudyData, incoming: TermStudyData): TermStudyData {
  const entries = new Map(local.entries.map(e => [e.key, e]));
  for (const entry of incoming.entries) { const old = entries.get(entry.key); if (!old) entries.set(entry.key, entry); else entries.set(entry.key, {...(entry.updatedAt > old.updatedAt ? entry : old), savedAt: Math.min(old.savedAt, entry.savedAt)}); }
  return {version: 1, entries: [...entries.values()]};
}
