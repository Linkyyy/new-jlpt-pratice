import type { PassageTranslation, TranslatedParagraph, TranslatedSentence } from "./passage-translation";

const japanese = new Intl.Segmenter("ja", { granularity: "sentence" });
const chinese = new Intl.Segmenter("zh-CN", { granularity: "sentence" });
const sectionLabel = /^\s*(?:[ABＡＢ]|[（(]\s*[0-9０-９]{1,2}\s*[）)])\s*$/;
const trailingOpen = /[（(「『“‘《〈【〔［]+\s*$/u;

function sentences(text: string, segmenter: Intl.Segmenter): string[] {
  const result: string[] = [];
  let prefix = "";
  for (const { segment, index } of segmenter.segment(text)) {
    const opening = index + segment.length < text.length ? segment.match(trailingOpen)?.[0] ?? "" : "";
    const part = prefix + segment.slice(0, segment.length - opening.length);
    prefix = opening;
    if (sectionLabel.test(part) || !part.trim()) {
      prefix = part + prefix;
      continue;
    }
    const previous = result.at(-1);
    // Quotations can end in punctuation inside the surrounding Japanese sentence.
    if (segmenter === japanese && previous && /[!?。！？][」』]\s*$/u.test(previous) && /^\s*(?:と(?!ころ)|って|など|[。、])/u.test(part)) {
      result[result.length - 1] += part;
    } else result.push(part);
  }
  if (prefix.trim()) result.push(prefix);
  return result;
}

interface Span {
  end: number;
  length: number;
  numbers: string;
}

function spans(parts: string[]): Span[][] {
  return parts.map((_, start) => parts.slice(start).map((_, offset) => {
    const end = start + offset + 1;
    const text = parts.slice(start, end).join("").normalize("NFKC");
    return { end, length: (text.match(/[\p{L}\p{N}]/gu) ?? []).length, numbers: (text.match(/\d+/g) ?? []).join(" ") };
  }));
}

function align({ original, translation }: TranslatedParagraph): TranslatedSentence[] {
  const ja = sentences(original, japanese);
  const zh = sentences(translation, chinese);
  if (ja.length === 1 || zh.length === 1) return [{ original, translation, ...(ja.length > 1 ? { combined: true } : {}) }];

  const originalSpans = spans(ja);
  const translatedSpans = spans(zh);
  const ratio = (translatedSpans[0].at(-1)!.length + 1) / (originalSpans[0].at(-1)!.length + 1);
  const matrix = () => Array.from({ length: ja.length + 1 }, () => Array<number>(zh.length + 1).fill(Infinity));

  function matches(i: number, j: number) {
    return originalSpans[i].flatMap((a, offset) => (offset ? translatedSpans[j].slice(0, 1) : translatedSpans[j]).map(b => {
      const lengthCost = Math.abs(Math.log((b.length + 8) / (a.length * ratio + 8)));
      const numberCost = a.numbers === b.numbers ? 0 : 0.8;
      return { a: a.end, b: b.end, cost: lengthCost + numberCost + 0.28 * (a.end - i + b.end - j - 2) };
    }));
  }

  const before = matrix();
  before[0][0] = 0;
  for (let i = 0; i < ja.length; i++) for (let j = 0; j < zh.length; j++) {
    for (const { a, b, cost } of matches(i, j)) before[a][b] = Math.min(before[a][b], before[i][j] + cost);
  }

  const after = matrix();
  after[ja.length][zh.length] = 0;
  const cuts = new Map<number, number>();
  const limit = before[ja.length][zh.length] + 0.2;
  for (let i = ja.length - 1; i >= 0; i--) for (let j = zh.length - 1; j >= 0; j--) {
    for (const { a, b, cost } of matches(i, j)) {
      after[i][j] = Math.min(after[i][j], cost + after[a][b]);
      if (before[i][j] + cost + after[a][b] > limit) continue;
      // Keep only boundaries shared by the plausible alignments.
      for (let skipped = i + 1; skipped < a; skipped++) cuts.set(skipped, -1);
      const other = cuts.get(a);
      cuts.set(a, other === undefined || other === b ? b : -1);
    }
  }

  let startJa = 0, startZh = 0;
  const result: TranslatedSentence[] = [];
  for (let endJa = 1; endJa <= ja.length; endJa++) {
    const endZh = cuts.get(endJa) ?? -1;
    if (endZh < 0) continue;
    result.push({
      original: ja.slice(startJa, endJa).join("").trim(),
      translation: zh.slice(startZh, endZh).join("").trim(),
      ...(endJa - startJa > 1 ? { combined: true } : {}),
    });
    startJa = endJa;
    startZh = endZh;
  }
  return result.length ? result : [{ original, translation, combined: true }];
}

export function passageSentences(passage: PassageTranslation): TranslatedSentence[] {
  // Transcribed tables and lists are already grouped by their printed sections.
  return passage.transcribedImage ? [...passage.paragraphs] : passage.paragraphs.flatMap(align);
}
