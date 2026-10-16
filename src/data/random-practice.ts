import type { PracticeQuestion } from "./practice-question";
import { articleGroupKey } from "../app/practice/article-questions";

export const RANDOM_PERIOD = "random";
export const RANDOM_QUESTION_TARGET = 20;

/** Generate only on an explicit start/restart, never during rendering or prefetch. */
export function createRandomPeriod(): string {
  return `random-${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
}

/** The seed stays in the saved year/URL, so existing backup snapshots need no new fields. */
export function isRandomPeriod(period: string): boolean {
  return period === RANDOM_PERIOD || /^random-[a-f0-9]{32}$/.test(period);
}

export function questionPeriod(question: Pick<PracticeQuestion, "id">): string | undefined {
  return question.id.match(/^imported:(\d{6}):/)?.[1] ?? question.id.match(/^N[1-5]-(\d{4})-/)?.[1];
}

function randomGenerator(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** Shuffle whole passages/shared audio; keep each group's original subquestion order. */
export function selectRandomQuestions(pool: readonly PracticeQuestion[], seed: string, target = RANDOM_QUESTION_TARGET): PracticeQuestion[] {
  if (!seed || !Number.isSafeInteger(target) || target < 1) throw new Error("Invalid random practice selection");
  const groups = new Map<string, PracticeQuestion[]>(), seen = new Set<string>();
  for (const question of pool) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    const key = JSON.stringify([questionPeriod(question) ?? question.level, articleGroupKey(question)]);
    const group = groups.get(key) ?? [];
    group.push(question); groups.set(key, group);
  }
  const shuffled = [...groups.values()], random = randomGenerator(seed);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const next = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[next]] = [shuffled[next], shuffled[index]];
  }
  const selected: PracticeQuestion[] = [];
  for (const group of shuffled) {
    selected.push(...group);
    if (selected.length >= target) break;
  }
  return selected;
}
