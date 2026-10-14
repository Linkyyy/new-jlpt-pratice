export const practiceModes = [
  { value: "practice", label: "练习模式", description: "逐题提交，即时反馈与解析；提交后锁定答案。" },
  { value: "exam", label: "考试模式", description: "限时作答，交卷前可修改答案；交卷后统一判定。" },
] as const;

export type PracticeMode = (typeof practiceModes)[number]["value"];

// 原创短卷的训练时长：9 题 15 分钟，3 题 5 分钟，并非正式 JLPT 时长。
export function getExamDuration(questionCount: number): number {
  return Math.ceil(questionCount * 100 / 60) * 60;
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60).toString().padStart(2, "0")}:${(safeSeconds % 60).toString().padStart(2, "0")}`;
}
