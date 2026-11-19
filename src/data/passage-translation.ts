import n1Index from "./passage-translations/n1-index.json";

export interface TranslatedParagraph {
  readonly original: string;
  readonly translation: string;
}

export interface PassageTranslation {
  readonly paragraphs: readonly TranslatedParagraph[];
  readonly transcribedImage?: boolean;
}

export function n1TranslationIndex(questionId: string): number | undefined {
  return Object.hasOwn(n1Index, questionId) ? n1Index[questionId as keyof typeof n1Index] : undefined;
}

export function isPassageTranslation(value: unknown): value is PassageTranslation {
  if (!value || typeof value !== "object" || !("paragraphs" in value)) return false;
  const { paragraphs } = value;
  return Array.isArray(paragraphs) && paragraphs.length > 0 && paragraphs.every(paragraph =>
    typeof paragraph?.original === "string" && !!paragraph.original.trim()
    && typeof paragraph.translation === "string" && !!paragraph.translation.trim());
}
