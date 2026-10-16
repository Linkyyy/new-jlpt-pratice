import type { JLPTLevel, OptionId, QuestionCategory } from "@/data/practice-question";

export interface PracticeScoreQuestion {
  readonly id: string;
  readonly category: QuestionCategory;
  readonly correctOptionId: OptionId;
}

export interface PracticeScoringPaper {
  readonly level: JLPTLevel | "混合";
  readonly questions: readonly PracticeScoreQuestion[];
  readonly fullPaper?: boolean;
}

export interface PracticeScoreSection {
  readonly id: string;
  readonly label: string;
  readonly score: number;
  readonly maxScore: number;
  readonly correct: number;
  readonly total: number;
  readonly available: boolean;
}

export interface PracticeScoreResult {
  readonly score: number;
  readonly maxScore: number;
  /** Raw question accuracy, independent of the section-weighted estimate. */
  readonly percent: number;
  readonly correct: number;
  readonly total: number;
  readonly unanswered: number;
  readonly sections: readonly PracticeScoreSection[];
  readonly missingSections: boolean;
}

interface SectionDefinition {
  readonly id: string;
  readonly label: string;
  readonly maxScore: number;
  readonly categories: readonly QuestionCategory[];
}

const scoringSections: readonly SectionDefinition[] = [
  { id: "language-knowledge", label: "语言知识（词汇·语法）", maxScore: 60, categories: ["词汇", "语法"] },
  { id: "reading", label: "阅读", maxScore: 60, categories: ["阅读"] },
  { id: "listening", label: "听力", maxScore: 60, categories: ["听力"] },
];

// Vocabulary and grammar share 60 points. Their 30/30 split is a site estimate,
// not an independently published JLPT scaled-score allocation.
const categoryMaxima: Readonly<Record<QuestionCategory, number>> = {
  "词汇": 30, "语法": 30, "阅读": 60, "听力": 60,
};

/**
 * Use the same category weights for single, mixed and full-paper practice.
 * Full papers retain all 180 points; missing categories never transfer weight.
 * Actual JLPT scaled scores cannot be inferred from accuracy alone.
 */
export function calculatePracticeScore(
  paper: PracticeScoringPaper,
  answers: Readonly<Partial<Record<string, OptionId>>>,
): PracticeScoreResult {
  const categories = (Object.keys(categoryMaxima) as QuestionCategory[]).map(category => {
    const questions = paper.questions.filter(question => question.category === category);
    const total = questions.length;
    const correct = questions.filter(question => answers[question.id] === question.correctOptionId).length;
    const maxScore = categoryMaxima[category];
    return { category, total, correct, maxScore, score: total ? Math.round(correct / total * maxScore) : 0 };
  });

  const sections = scoringSections.flatMap((definition): PracticeScoreSection[] => {
    const included = categories.filter(category => definition.categories.includes(category.category) && (paper.fullPaper || category.total > 0));
    if (!included.length) return [];
    const total = included.reduce((sum, category) => sum + category.total, 0);
    return [{
      id: definition.id,
      label: included.length === 1 ? included[0].category : definition.label,
      score: included.reduce((sum, category) => sum + category.score, 0),
      maxScore: paper.fullPaper ? definition.maxScore : included.reduce((sum, category) => sum + category.maxScore, 0),
      correct: included.reduce((sum, category) => sum + category.correct, 0),
      total,
      available: total > 0,
    }];
  });

  const total = paper.questions.length;
  const correct = sections.reduce((sum, section) => sum + section.correct, 0);
  return {
    score: sections.reduce((sum, section) => sum + section.score, 0),
    maxScore: sections.reduce((sum, section) => sum + section.maxScore, 0),
    percent: total ? Math.round(correct / total * 100) : 0,
    correct,
    total,
    unanswered: paper.questions.filter(question => answers[question.id] == null).length,
    sections,
    missingSections: total === 0 || Boolean(paper.fullPaper && categories.some(category => category.total === 0)),
  };
}
