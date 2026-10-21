import { createHash, randomUUID } from "node:crypto";
import { loadFrequencyCorpus, findFrequencyTerm } from "./bank-frequency.server";
import { parseTermStudyKey, termStudyKey } from "./term-study-data";
import { isTermFeedbackIssue } from "./frequency-term-feedback";
import { feedbackInput } from "./question-feedback.server";
import { applyCloudRateLimit, checkCloudRateLimit, cloudJson, CloudServiceError, getCloudSession, handleCloudRequest, queryCloudDatabase, requireCloudSameOrigin } from "./cloud-backup.server";
import { checkApiRateLimit, requestClientIp } from "./request-limits";

export function submitFrequencyFeedback(request: Request) {
  return handleCloudRequest(async () => {
    requireCloudSameOrigin(request);
    const denied = checkApiRateLimit(request, {scope: "feedback-submit", limit: 10, windowSeconds: 3600});
    if (denied) return denied;
    const body = await feedbackInput(request, 8192), identity = parseTermStudyKey(body.key);
    if (!identity || !isTermFeedbackIssue(body.issueType) || typeof body.revision !== "string" || typeof body.description !== "string" || body.description.trim().length < 5 || body.description.trim().length > 2000) throw new CloudServiceError(400, "请选择问题类型，并填写 5–2000 字的问题说明。");
    const corpus = await loadFrequencyCorpus();
    if (body.revision !== corpus.revision) throw new CloudServiceError(409, "词条已更新，请刷新页面后重新提交纠错。");
    const termId = findFrequencyTerm(corpus, identity);
    if (termId < 0) throw new CloudServiceError(404, "未找到该词条，请刷新页面后重试。");
    const [label, reading, pos, kind] = corpus.terms[termId];
    const term = {label, reading, pos, kind: kind === "connective" ? "word" as const : kind};
    const user = await getCloudSession(request), ip = requestClientIp(request);
    checkCloudRateLimit("feedback-ip", ip, 3600);
    if (user) checkCloudRateLimit("feedback-user", user.id, 3600);
    await applyCloudRateLimit("feedback-ip", ip, 10, 3600);
    if (user) await applyCloudRateLimit("feedback-user", user.id, 20, 3600);
    const exampleIds = new Set<string>();
    for (const [, references, counts] of corpus.units) {
      if (counts.some((id, i) => i % 2 === 0 && id === termId)) for (const index of references) { exampleIds.add(corpus.questions[index][0]); if (exampleIds.size >= 3) break; }
      if (exampleIds.size >= 3) break;
    }
    // Reuse the existing feedback schema/admin workflow. The tagged snapshot
    // preserves the exact reported term after later index rebuilds.
    const description = JSON.stringify({version: 1, type: "frequency-term", term, issue: body.issueType, revision: corpus.revision, exampleIds: [...exampleIds], description: body.description.trim()});
    const example = corpus.questions.find(q => q[0] === [...exampleIds][0]);
    const id = randomUUID(), now = Date.now(), questionId = `frequency:${createHash("sha256").update(termStudyKey(term)).digest("hex")}`;
    await queryCloudDatabase("INSERT INTO question_feedback (id, question_id, level, period, category, source, question_number, issue_type, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)", [id, questionId, example?.[2] ?? "", example?.[3] ?? "", "词条", example?.[1] === "original" ? "original" : "imported", null, "other", description, now, now]);
    return cloudJson({ok: true, id}, 201);
  });
}
