import type { PracticeMode } from "@/data/practice-modes";
import type { PracticePaper } from "@/data/practice-papers";
import type { PracticeQuestion } from "@/data/practice-question";
import type { StudyAttempt, StudyQuestion } from "./study-store";

function matchesQuestions(saved: readonly StudyQuestion[], questions: readonly PracticeQuestion[]): boolean {
  return saved.length === questions.length && saved.every((question, index) => {
    const next = questions[index];
    return question.id === next.id && question.category === next.category && question.level === next.level && question.correctOptionId === next.correctOptionId
      && question.optionIds.join() === next.options.map(option => option.id).join();
  });
}

/** Keep earlier written-only whole-paper attempts playable after adding listening. */
export function restorePracticePaper(paper: PracticePaper, attempt: StudyAttempt, mode: PracticeMode): PracticePaper | null {
  if (attempt.paperId !== paper.id || attempt.mode !== mode || attempt.source !== (paper.source ?? "original")
    || attempt.year !== paper.year || attempt.level !== paper.level
    || paper.source !== "favorites" && !paper.id.endsWith(`-${attempt.type}`)) return null;
  if (matchesQuestions(attempt.questions, paper.questions)) return paper;

  if (!paper.id.endsWith("-all") || attempt.type !== "all" || paper.source === "favorites" || attempt.source === "favorites"
    || attempt.questions.length === 0 || attempt.questions.some(question => question.category === "听力")
    || !paper.questions.some(question => question.category === "听力")) return null;

  const writtenQuestions = paper.questions.filter(question => question.category !== "听力");
  if (!matchesQuestions(attempt.questions, writtenQuestions)) return null;

  return { ...paper, questions: writtenQuestions, typeLabel: attempt.typeLabel };
}
