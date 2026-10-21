import { decodeTermFeedback } from "./frequency-term-feedback";
import { randomUUID } from "node:crypto";
import { loadFavoriteQuestions } from "@/data/imported-papers.server";
import { applyCloudRateLimit, checkCloudRateLimit, cloudJson, CloudServiceError, getCloudSession, handleCloudRequest, queryCloudDatabase, requireCloudSameOrigin } from "./cloud-backup.server";
import { checkApiRateLimit, HttpRequestError, readLimitedJson, requestClientIp } from "./request-limits";
import { isFeedbackIssueType, isFeedbackQuestionId, isFeedbackStatus, type QuestionFeedbackRecord } from "./question-feedback";

const columns = "id, question_id AS questionId, level, period, category, source, question_number AS questionNumber, issue_type AS issueType, description, status, created_at AS createdAt, updated_at AS updatedAt";
export async function feedbackInput(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  try {
    const value = await readLimitedJson(request, maxBytes);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CloudServiceError(400, "请求格式无效。");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpRequestError) throw new CloudServiceError(error.status, error.message);
    throw error;
  }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
async function requireFeedbackAdmin(request: Request) {
  const allowed = (process.env.FEEDBACK_ADMIN_USERS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(value => /^[a-z0-9_]{3,32}$/.test(value));
  if (!allowed.length) throw new CloudServiceError(403, "反馈管理尚未配置，请设置管理员账号。");
  const user = await getCloudSession(request);
  if (!user) throw new CloudServiceError(401, "请先登录允许查看反馈的云备份账号。");
  if (!allowed.includes(user.username)) throw new CloudServiceError(403, "此账号没有查看题目反馈的权限。");
  return user;
}
export function submitQuestionFeedback(request: Request) {
  return handleCloudRequest(async () => {
    requireCloudSameOrigin(request);
    const denied = checkApiRateLimit(request, { scope: "feedback-submit", limit: 10, windowSeconds: 3600 });
    if (denied) return denied;
    const body = await feedbackInput(request, 8192);
    if (!isFeedbackQuestionId(body.questionId) || !isFeedbackIssueType(body.issueType) || typeof body.description !== "string" || body.description.trim().length < 5 || body.description.trim().length > 2000) throw new CloudServiceError(400, "请选择问题类型，并填写 5–2000 字的问题说明。");
    const record = (await loadFavoriteQuestions([body.questionId]))[0];
    if (!record) throw new CloudServiceError(404, "未找到这道题目，请刷新后重试。");
    // Only hashes of rate-limit keys are persisted. Reports contain no IP,
    // passwords, session tokens, full answer sheets or unrelated study history.
    const user = await getCloudSession(request), ip = requestClientIp(request);
    checkCloudRateLimit("feedback-ip", ip, 3600);
    if (user) checkCloudRateLimit("feedback-user", user.id, 3600);
    await applyCloudRateLimit("feedback-ip", ip, 10, 3600);
    if (user) await applyCloudRateLimit("feedback-user", user.id, 20, 3600);
    const { question } = record, id = randomUUID(), now = Date.now();
    await queryCloudDatabase("INSERT INTO question_feedback (id, question_id, level, period, category, source, question_number, issue_type, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)", [id, question.id, question.level, record.year, question.category, record.source ?? "original", question.sourceQuestionNumber ?? null, body.issueType, body.description.trim(), now, now]);
    return cloudJson({ ok: true, id }, 201);
  });
}
export function listQuestionFeedback(request: Request) {
  return handleCloudRequest(async () => {
    const denied = checkApiRateLimit(request, { scope: "feedback-list", limit: 60, windowSeconds: 60 });
    if (denied) return denied;
    await requireFeedbackAdmin(request);
    const url = new URL(request.url), status = url.searchParams.get("status") ?? "all", cursor = url.searchParams.get("cursor");
    if (status !== "all" && !isFeedbackStatus(status)) throw new CloudServiceError(400, "反馈筛选条件无效。");
    const where: string[] = [], params: (string | number | null)[] = [];
    if (status !== "all") { where.push("status = ?"); params.push(status); }
    if (cursor) {
      const separator = cursor.indexOf(":"), time = cursor.slice(0, separator), id = cursor.slice(separator + 1);
      if (separator < 1 || !/^\d{13}$/.test(time) || !uuid.test(id)) throw new CloudServiceError(400, "反馈筛选条件无效。");
      where.push("(created_at, id) < (?, ?)"); params.push(Number(time), id);
    }
    const rows = await queryCloudDatabase<QuestionFeedbackRecord>(`SELECT ${columns} FROM question_feedback${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT 51`, params);
    const items = rows.slice(0, 50).map(decodeTermFeedback), last = items.at(-1);
    return cloudJson({ items, nextCursor: rows.length > 50 && last ? `${last.createdAt}:${last.id}` : null });
  });
}
export function updateQuestionFeedback(request: Request) {
  return handleCloudRequest(async () => {
    requireCloudSameOrigin(request);
    const denied = checkApiRateLimit(request, { scope: "feedback-update", limit: 60, windowSeconds: 60 });
    if (denied) return denied;
    await requireFeedbackAdmin(request);
    const body = await feedbackInput(request, 1024);
    if (typeof body.id !== "string" || !uuid.test(body.id) || !isFeedbackStatus(body.status)) throw new CloudServiceError(400, "反馈状态无效。");
    const updated = await queryCloudDatabase("UPDATE question_feedback SET status = ?, updated_at = ? WHERE id = ? RETURNING id", [body.status, Date.now(), body.id]);
    if (!updated.length) throw new CloudServiceError(404, "未找到这条反馈。");
    return cloudJson({ ok: true });
  });
}
