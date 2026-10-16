import type { PracticeQuestion } from "@/data/practice-question";

function sourcePaper(question: PracticeQuestion): string {
  return question.id.startsWith("imported:") ? question.id.split(":").slice(0, 4).join(":") : question.id.match(/^N[1-5]-\d{4}/)?.[0] ?? question.level;
}

function listeningGroupKey(question: PracticeQuestion): string | null {
  if (question.category !== "听力" || !question.media?.audio) return null;
  return JSON.stringify(["听力", sourcePaper(question), question.media.audio]);
}

export function usesArticleDrawer(question: PracticeQuestion, questions: readonly PracticeQuestion[] = []): boolean {
  if (question.category === "阅读" || question.category === "语法") return Boolean(question.passage?.trim() || question.media?.images.length);
  const key = listeningGroupKey(question);
  return key !== null && questions.some(item => item.id !== question.id && listeningGroupKey(item) === key);
}

export function articleGroupKey(question: PracticeQuestion): string {
  return listeningGroupKey(question) ?? (usesArticleDrawer(question)
    ? JSON.stringify([question.category, sourcePaper(question), question.passage?.trim() ?? "", question.richText ?? false, question.media?.images ?? [], question.media?.audio ?? null])
    : question.id);
}

export function articleGroup(questions: readonly PracticeQuestion[], question: PracticeQuestion) {
  const key = articleGroupKey(question);
  return questions.flatMap((item, index) => articleGroupKey(item) === key ? [{ item, index }] : []);
}
