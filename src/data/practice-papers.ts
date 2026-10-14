import {
  levels,
  type JLPTLevel,
  type OptionId,
  type PracticeQuestion,
  type QuestionCategory,
} from "./practice-question";
import questionBank from "./question-bank.json";

export const years = ["2026", "2025"] as const;
export type PaperYear = string;

export const questionTypes = [
  { value: "all", label: "整套文字练习", category: null },
  { value: "vocabulary", label: "词汇", category: "词汇" },
  { value: "grammar", label: "语法", category: "语法" },
  { value: "reading", label: "阅读", category: "阅读" },
  { value: "listening", label: "听力", category: "听力" },
] as const;
export type QuestionType = (typeof questionTypes)[number]["value"];

export interface PracticePaper {
  readonly id: string;
  readonly level: JLPTLevel;
  readonly year: PaperYear;
  readonly typeLabel: string;
  readonly questions: readonly PracticeQuestion[];
  readonly source?: "original" | "imported";
  readonly periodLabel?: string;
  readonly sourceLabel?: string;
  readonly excludedCount?: number;
}

// JSON 只存放内容，TypeScript 负责验证并转换为页面使用的明确类型。
export type QuestionSeed = readonly [
  id: string,
  prompt: string,
  options: readonly [string, string, string, string],
  correctOptionId: OptionId,
  explanation: string | readonly string[],
];
type ThreeQuestions = readonly [QuestionSeed, QuestionSeed, QuestionSeed];

export interface PaperSeed {
  readonly vocabulary: ThreeQuestions;
  readonly grammar: ThreeQuestions;
  readonly reading: {
    readonly passage: string;
    readonly questions: ThreeQuestions;
  };
}

const optionIds = ["A", "B", "C", "D"] as const;

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuestionSeed(value: unknown): value is QuestionSeed {
  if (!Array.isArray(value) || value.length !== 5) return false;
  const [id, prompt, options, answer, explanation]: unknown[] = value;
  return isText(id) && isText(prompt)
    && Array.isArray(options) && options.length === 4 && options.every(isText) && new Set(options).size === 4
    && optionIds.some((optionId) => optionId === answer)
    && (isText(explanation) || Array.isArray(explanation) && explanation.length > 0 && explanation.every(isText));
}

function isThreeQuestions(value: unknown): value is ThreeQuestions {
  return Array.isArray(value) && value.length === 3 && value.every(isQuestionSeed);
}

function isPaperSeed(value: unknown): value is PaperSeed {
  return isRecord(value) && isThreeQuestions(value.vocabulary) && isThreeQuestions(value.grammar)
    && isRecord(value.reading) && isText(value.reading.passage) && isThreeQuestions(value.reading.questions);
}

function getSeed(level: JLPTLevel, year: PaperYear): PaperSeed {
  if (year !== "2026" && year !== "2025") throw new Error(`原创题库没有该版本：${year}`);
  const seed: unknown = questionBank.papers[level][year];
  if (questionBank.schemaVersion !== 1 || !isPaperSeed(seed)) throw new Error(`题库 JSON 格式无效：${level}-${year}`);
  return seed;
}

const questionIds = new Set<string>();
for (const level of levels) {
  for (const year of years) {
    const seed = getSeed(level, year);
    for (const question of [...seed.vocabulary, ...seed.grammar, ...seed.reading.questions]) {
      if (!question[0].startsWith(`${level}-${year}-`) || questionIds.has(question[0])) throw new Error(`题库 ID 不合法或重复：${question[0]}`);
      questionIds.add(question[0]);
    }
  }
}

export function getPracticePaper(
  level: JLPTLevel,
  year: PaperYear,
  type: QuestionType,
): PracticePaper {
  const seed = getSeed(level, year);
  const id = `${level}-${year}-${type}`;
  function makeQuestions(
    category: QuestionCategory,
    seeds: ThreeQuestions,
    passage?: string,
  ): PracticeQuestion[] {
    return seeds.map(([id, prompt, options, correctOptionId, explanation]) => ({
      id,
      level,
      category,
      passage,
      prompt,
      options: [
        { id: optionIds[0], text: options[0] },
        { id: optionIds[1], text: options[1] },
        { id: optionIds[2], text: options[2] },
        { id: optionIds[3], text: options[3] },
      ],
      correctOptionId,
      explanation: typeof explanation === "string" ? [explanation] : explanation,
    }));
  }

  const allQuestions = [
    ...makeQuestions("词汇", seed.vocabulary),
    ...makeQuestions("语法", seed.grammar),
    ...makeQuestions("阅读", seed.reading.questions, seed.reading.passage),
  ];
  const selection = questionTypes.find((item) => item.value === type)!;

  return {
    id,
    level,
    year,
    typeLabel: selection.label,
    questions: selection.category === null
      ? allQuestions
      : allQuestions.filter((question) => question.category === selection.category),
  };
}

export interface CatalogQuestion {
  readonly question: PracticeQuestion;
  readonly year: PaperYear;
  readonly source?: "original" | "imported";
}

export function getQuestionCatalog(): readonly CatalogQuestion[] {
  return levels.flatMap((level) => years.flatMap((year) => getPracticePaper(level, year, "all").questions.map((question) => ({ question, year }))));
}
