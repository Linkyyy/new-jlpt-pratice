export type OptionId = "A" | "B" | "C" | "D";

export const levels = ["N1", "N2", "N3", "N4", "N5"] as const;
export type JLPTLevel = (typeof levels)[number];
export const questionCategories = ["词汇", "语法", "阅读", "听力"] as const;
export type QuestionCategory = (typeof questionCategories)[number];

export interface PracticeOption {
  readonly id: OptionId;
  readonly text: string;
  readonly label?: string;
}

export interface PracticeQuestion {
  readonly id: string;
  readonly level: JLPTLevel;
  readonly category: QuestionCategory;
  readonly passage?: string;
  readonly prompt: string;
  readonly options: readonly PracticeOption[];
  readonly correctOptionId: OptionId;
  readonly explanation: readonly string[];
  readonly instruction?: string;
  readonly richText?: boolean;
  readonly sourceQuestionNumber?: number | null;
  readonly sourceId?: number;
  readonly media?: { readonly images: readonly string[]; readonly audio?: string };
}

export function optionLabel(question: PracticeQuestion, optionId: OptionId | undefined | null): string {
  return optionId == null ? "未作答" : question.options.find((option) => option.id === optionId)?.label ?? optionId;
}
