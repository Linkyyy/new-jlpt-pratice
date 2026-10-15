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

const upperLevelSections: readonly SectionDefinition[] = [
  { id: "language-knowledge", label: "语言知识（词汇·语法）", maxScore: 60, categories: ["词汇", "语法"] },
  { id: "reading", label: "阅读", maxScore: 60, categories: ["阅读"] },
  { id: "listening", label: "听力", maxScore: 60, categories: ["听力"] },
];

const lowerLevelSections: readonly SectionDefinition[] = [
  { id: "language-reading", label: "语言知识·阅读", maxScore: 120, categories: ["词汇", "语法", "阅读"] },
  { id: "listening", label: "听力", maxScore: 60, categories: ["听力"] },
];

const practiceSection: readonly SectionDefinition[] = [
  { id: "overall", label: "单项练习", maxScore: 60, categories: ["词汇", "语法", "阅读", "听力"] },
];

/**
 * Estimate practice points using JLPT section maxima. Actual JLPT scaled scores
 * depend on response-pattern statistics and cannot be inferred from accuracy.
 * Missing sections receive zero; their weight never moves to another section.
 */
export function calculatePracticeScore(
  paper: PracticeScoringPaper,
  answers: Readonly<Partial<Record<string, OptionId>>>,
): PracticeScoreResult {
  const definitions = paper.fullPaper && paper.level !== "混合"
    ? paper.level === "N4" || paper.level === "N5" ? lowerLevelSections : upperLevelSections
    : practiceSection;

  const sections = definitions.map((definition): PracticeScoreSection => {
    const questions = paper.questions.filter(question => definition.categories.includes(question.category));
    const total = questions.length;
    const correct = questions.filter(question => answers[question.id] === question.correctOptionId).length;
    return {
      id: definition.id,
      label: definition.label,
      score: total ? Math.min(definition.maxScore, Math.max(0, Math.round(correct / total * definition.maxScore))) : 0,
      maxScore: definition.maxScore,
      correct,
      total,
      available: total > 0,
    };
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
    missingSections: sections.some(section => !section.available),
  };
}
