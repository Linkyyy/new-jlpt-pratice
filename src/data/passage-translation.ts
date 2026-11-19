import n1Index from "./passage-translations/n1-index.json";

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

export function n1TranslationIndex(questionId: string): number | undefined {
  return Object.hasOwn(n1Index, questionId) ? n1Index[questionId as keyof typeof n1Index] : undefined;
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
