import n1Index from "./passage-translations/n1-index.json";
import n2Index from "./passage-translations/n2-index.json";
import n3Index from "./passage-translations/n3-index.json";

const levels = ["N1", "N2", "N3"] as const;
const indices: Record<(typeof levels)[number], Readonly<Record<string, number>>> = { N1: n1Index, N2: n2Index, N3: n3Index };

export interface TranslatedParagraph {
  readonly original: string;
  readonly translation: string;
}

export interface PassageTranslation {
  readonly paragraphs: readonly TranslatedParagraph[];
  readonly transcribedImage?: boolean;
}

export interface TranslatedSentence extends TranslatedParagraph {
  readonly combined?: boolean;
}

export interface PassageTranslationReview extends PassageTranslation {
  readonly sentences: readonly TranslatedSentence[];
}

export function passageTranslationLocation(questionId: string) {
  for (const level of levels) {
    const index = indices[level];
    if (Object.hasOwn(index, questionId)) return { level, position: index[questionId] };
  }
}

function isTranslationList(value: unknown): value is TranslatedParagraph[] {
  return Array.isArray(value) && value.length > 0 && value.every(pair =>
    typeof pair?.original === "string" && !!pair.original.trim()
    && typeof pair.translation === "string" && !!pair.translation.trim());
}

export function isPassageTranslationReview(value: unknown): value is PassageTranslationReview {
  return value !== null && typeof value === "object" && "paragraphs" in value && "sentences" in value
    && isTranslationList(value.paragraphs) && isTranslationList(value.sentences);
}

export async function fetchPassageTranslation(questionId: string, signal: AbortSignal): Promise<PassageTranslationReview> {
  const query = new URLSearchParams({ id: questionId });
  const response = await fetch(`/api/practice/passage-translation?${query}`, { signal });
  if (!response.ok) throw new Error("Passage translation request failed");
  const data: unknown = await response.json();
  if (!isPassageTranslationReview(data)) throw new Error("Invalid passage translation data");
  return data;
}
