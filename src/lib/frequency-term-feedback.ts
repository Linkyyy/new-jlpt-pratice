import { isTermIdentity, type TermIdentity } from "./term-study-data";
import type { QuestionFeedbackRecord } from "./question-feedback";
export const termFeedbackLabels = {token: "分词或写法有误", reading: "读音有误", pos: "词性分类有误", definition: "释义或用法有误", level: "参考等级有误", duplicate: "同词未合并或错误合并", other: "其他问题"} as const;
export type TermFeedbackIssue = keyof typeof termFeedbackLabels;
export type TermFeedbackResolution = {note:string; revision:string; updatedAt:number};
export type TermFeedbackContext = {term: TermIdentity; issue: TermFeedbackIssue; revision: string; exampleIds: string[]; resolution?:TermFeedbackResolution};
export function isTermFeedbackIssue(v: unknown): v is TermFeedbackIssue { return typeof v === "string" && Object.hasOwn(termFeedbackLabels, v); }
export function decodeTermFeedback(row: QuestionFeedbackRecord): QuestionFeedbackRecord {
  if (!row.questionId.startsWith("frequency:")) return row;
  try {
    const v = JSON.parse(row.description);
    if (v.version !== 1 || v.type !== "frequency-term" || !isTermIdentity(v.term) || !isTermFeedbackIssue(v.issue) || typeof v.revision !== "string" || typeof v.description !== "string" || !Array.isArray(v.exampleIds) || !v.exampleIds.every((x: unknown) => typeof x === "string")) return row;
    const resolution = typeof v.resolution?.note==='string' && typeof v.resolution?.revision==='string' && Number.isSafeInteger(v.resolution?.updatedAt) ? {note:v.resolution.note,revision:v.resolution.revision,updatedAt:v.resolution.updatedAt} : undefined;
    return {...row, description: v.description, termFeedback: {term: v.term, issue: v.issue, revision: v.revision, exampleIds: v.exampleIds,...(resolution?{resolution}:{})}};
  } catch { return row; }
}
