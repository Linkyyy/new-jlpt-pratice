import type { JLPTLevel, OptionId, PracticeQuestion, QuestionCategory } from "@/data/practice-question";
import type { PracticePaper } from "@/data/practice-papers";

type AnalysisQuestion = Pick<PracticeQuestion, "id" | "level" | "category" | "correctOptionId" | "instruction">;

export interface QuestionTypeAnalysis {
  readonly key: string;
  readonly category: QuestionCategory;
  readonly level: JLPTLevel;
  readonly label: string;
  readonly problemNumber?: string;
  readonly total: number;
  readonly correct: number;
  readonly wrong: number;
  readonly unanswered: number;
  readonly percent: number;
  readonly firstReviewIndex?: number;
}

function subtype(question: AnalysisQuestion) {
  const instruction = (question.instruction ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").normalize("NFKC");
  const problemNumber = instruction.match(/問[題题]\s*(\d+)/)?.[1];
  let label: string = question.category;
  if (question.category === "词汇") {
    if (/読み方|よみかた/.test(instruction)) label = "汉字读音";
    else if (/漢字で|かんじで/.test(instruction)) label = "汉字书写";
    else if (/意味が最も近|意味がいちばん近/.test(instruction)) label = "近义表达";
    else if (/使い方|つかいかた/.test(instruction)) label = "词语用法";
    else if (/入れる|入る/.test(instruction)) label = "词汇填空";
  } else if (question.category === "语法") {
    if (/文章を読|文章全体/.test(instruction)) label = "文章语法";
    else if (/★|\u2606/.test(instruction)) label = "语句排序";
    else if (/文の|ぶんの/.test(instruction) && /入れる|入る/.test(instruction)) label = "语法选择";
  }
  // Problem numbers vary by level and exam. Preserve the actual grouping for
  // reading/listening rather than claiming an official subtype from a number.
  // Several vocabulary sections use the same fill-in instruction (for example
  // N2 word formation and contextual choice). Keep those sections distinct.
  const numbered = (label === question.category || label === "词汇填空") && problemNumber !== undefined;
  const key = numbered ? `${question.category}:${question.level}:${problemNumber}` : `${question.category}:${label}`;
  return { key, label, problemNumber: numbered ? problemNumber : undefined };
}

/** Accuracy analysis is separate from, and never changes, the score weights. */
export function analyzeQuestionTypes(
  questions: readonly AnalysisQuestion[],
  answers: Readonly<Partial<Record<string, OptionId>>>,
): QuestionTypeAnalysis[] {
  const groups = new Map<string, QuestionTypeAnalysis>();
  questions.forEach((question, index) => {
    const type = subtype(question);
    const prior = groups.get(type.key);
    const correct = answers[question.id] === question.correctOptionId;
    const unanswered = answers[question.id] === undefined;
    const wrong = !correct && !unanswered;
    groups.set(type.key, {
      ...type,
      category: question.category,
      level: prior?.level ?? question.level,
      total: (prior?.total ?? 0) + 1,
      correct: (prior?.correct ?? 0) + Number(correct),
      wrong: (prior?.wrong ?? 0) + Number(wrong),
      unanswered: (prior?.unanswered ?? 0) + Number(unanswered),
      percent: 0,
      // Prefer an actual wrong answer; otherwise let the user revisit a blank.
      firstReviewIndex: prior?.wrong ? prior.firstReviewIndex : wrong ? index : prior?.firstReviewIndex ?? (unanswered ? index : undefined),
    });
  });
  return [...groups.values()].map(group => ({ ...group, percent: Math.round(group.correct / group.total * 100) }));
}

export function suggestedQuestionTypes(groups: readonly QuestionTypeAnalysis[]): QuestionTypeAnalysis[] {
  return groups.filter(group => group.wrong > 0 || group.unanswered > 0)
    .sort((a, b) => a.percent - b.percent || b.wrong - a.wrong || b.total - a.total)
    .slice(0, 2);
}

/** Link to an existing whole-category practice, never an unsupported subtype URL. */
export function questionTypePracticeHref(paper: PracticePaper, group: QuestionTypeAnalysis): string {
  if (paper.source === "favorites") {
    if (paper.id === "mistakes-practice" || paper.id === "due-practice") {
      return `/favorites/practice?${new URLSearchParams({ view: "mistakes", category: group.category, level: "all", fresh: "1" })}`;
    }
    return `/favorites/practice?${new URLSearchParams({ folder: "all", category: group.category, level: "all", fresh: "1" })}`;
  }
  const types: Record<QuestionCategory, string> = { "词汇": "vocabulary", "语法": "grammar", "阅读": "reading", "听力": "listening" };
  return `/practice?${new URLSearchParams({ source: paper.source ?? "original", level: group.level, year: paper.year.startsWith("random-") ? "random" : paper.year, type: types[group.category], mode: "practice", fresh: "1" })}`;
}
