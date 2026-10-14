import type { PracticeQuestion } from "@/data/practice-question";

export function usesArticleDrawer(question: PracticeQuestion): boolean {
  return (question.category === "阅读" || question.category === "语法") && Boolean(question.passage?.trim());
}

export function articleGroupKey(question: PracticeQuestion): string {
  return usesArticleDrawer(question)
    ? JSON.stringify([question.category, question.passage!.trim(), question.richText ?? false, question.media ?? null])
    : question.id;
}

export function articleGroup(questions: readonly PracticeQuestion[], question: PracticeQuestion) {
  const key = articleGroupKey(question);
  return questions.flatMap((item, index) => articleGroupKey(item) === key ? [{ item, index }] : []);
}
