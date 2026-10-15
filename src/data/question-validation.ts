import { levels, questionCategories, type PracticeOption, type PracticeQuestion } from "./practice-question";
import type { CatalogQuestion } from "./practice-papers";
import { isAudioReference } from "@/lib/audio-url.mjs";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOption(value: unknown): value is PracticeOption {
  return isRecord(value) && ["A", "B", "C", "D"].some((id) => id === value.id) && typeof value.text === "string" && (value.label === undefined || typeof value.label === "string");
}

export function isPracticeQuestion(value: unknown): value is PracticeQuestion {
  if (!isRecord(value) || typeof value.id !== "string" || !levels.some((level) => level === value.level) || !questionCategories.some((category) => category === value.category)
    || typeof value.prompt !== "string" || value.passage !== undefined && typeof value.passage !== "string" || value.instruction !== undefined && typeof value.instruction !== "string"
    || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 4 || !Array.isArray(value.explanation) || !value.explanation.every((item: unknown) => typeof item === "string")) return false;
  const options: unknown[] = value.options;
  return options.every(isOption) && new Set(options.map((option) => option.id)).size === options.length && options.some((option) => option.id === value.correctOptionId)
    && (value.richText === undefined || typeof value.richText === "boolean")
    && (value.sourceQuestionNumber === undefined || value.sourceQuestionNumber === null || typeof value.sourceQuestionNumber === "number" && Number.isInteger(value.sourceQuestionNumber))
    && (value.sourceId === undefined || typeof value.sourceId === "number" && Number.isInteger(value.sourceId))
    && (value.media === undefined || isRecord(value.media) && Array.isArray(value.media.images) && value.media.images.every((image: unknown) => typeof image === "string" && image.startsWith("/imported-media/")) && (value.media.audio === undefined || isAudioReference(value.media.audio)));
}

export function isCatalogQuestion(value: unknown): value is CatalogQuestion {
  return isRecord(value) && typeof value.year === "string" && isPracticeQuestion(value.question) && (value.source === undefined || value.source === "original" || value.source === "imported");
}
