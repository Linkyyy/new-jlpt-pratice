import { listQuestionFeedback, submitQuestionFeedback, updateQuestionFeedback } from "@/lib/question-feedback.server";

export const GET = listQuestionFeedback;
export const POST = submitQuestionFeedback;
export const PATCH = updateQuestionFeedback;
