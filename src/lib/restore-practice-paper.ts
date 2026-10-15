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

/** Restore complete snapshots from before listening and remote reading images were added. */
export function restorePracticePaper(paper: PracticePaper, attempt: StudyAttempt, mode: PracticeMode): PracticePaper | null {
  if (attempt.paperId !== paper.id || attempt.mode !== mode || attempt.source !== (paper.source ?? "original")
    || attempt.year !== paper.year || attempt.level !== paper.level
    || paper.source !== "favorites" && !paper.id.endsWith(`-${attempt.type}`)) return null;
  if (matchesQuestions(attempt.questions, paper.questions)) return paper;

  if (paper.source === "favorites" || attempt.source === "favorites" || attempt.questions.length === 0) return null;

  const beforeReadingImages = paper.questions.filter(question => !(question.category === "阅读" && question.media?.images.some(image => image.startsWith("pic/"))));
  if ((attempt.type === "all" || attempt.type === "reading") && beforeReadingImages.length < paper.questions.length
    && matchesQuestions(attempt.questions, beforeReadingImages)) return { ...paper, questions: beforeReadingImages, typeLabel: attempt.typeLabel };

  if (!paper.id.endsWith("-all") || attempt.type !== "all" || attempt.questions.some(question => question.category === "听力")
    || !paper.questions.some(question => question.category === "听力")) return null;

  const writtenQuestions = paper.questions.filter(question => question.category !== "听力");
  if (matchesQuestions(attempt.questions, writtenQuestions)) return { ...paper, questions: writtenQuestions, typeLabel: attempt.typeLabel };

  const beforeListeningAndImages = beforeReadingImages.filter(question => question.category !== "听力");
  return matchesQuestions(attempt.questions, beforeListeningAndImages)
    ? { ...paper, questions: beforeListeningAndImages, typeLabel: attempt.typeLabel }
    : null;
}
