import type { TermFeedbackContext } from "./frequency-term-feedback";
export const feedbackIssueTypes = ["answer", "text", "image", "audio", "other"] as const;
export type FeedbackIssueType = (typeof feedbackIssueTypes)[number];
export const feedbackStatuses = ["new", "reviewing", "resolved"] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];
export const feedbackIssueLabels: Record<FeedbackIssueType, string> = { answer: "答案或解析有误", text: "题干或选项有误", image: "图片缺失或错误", audio: "音频缺失或错误", other: "其他问题" };
export const feedbackStatusLabels: Record<FeedbackStatus, string> = { new: "待处理", reviewing: "处理中", resolved: "已处理" };
export type QuestionFeedbackRecord = {
  termFeedback?: TermFeedbackContext;
  id: string; questionId: string; level: string; period: string; category: string; source: "original" | "imported";
  questionNumber: number | null; issueType: FeedbackIssueType; description: string; status: FeedbackStatus; createdAt: number; updatedAt: number;
};
export type FeedbackList = { items: QuestionFeedbackRecord[]; nextCursor: string | null };
export function isFeedbackIssueType(value: unknown): value is FeedbackIssueType { return feedbackIssueTypes.some(type => type === value); }
export function isFeedbackStatus(value: unknown): value is FeedbackStatus { return feedbackStatuses.some(status => status === value); }
export function isFeedbackQuestionId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && (/^imported:\d{6}:N[1-5]:[1-4]:\d+:(?:\d+|single)$/.test(value) || /^N[1-5]-\d{4}-(?:词汇|语法|阅读|听力)-\d+$/.test(value));
}
