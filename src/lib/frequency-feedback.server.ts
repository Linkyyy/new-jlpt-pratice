import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
    const receipt = randomBytes(32).toString('hex');
    const description = JSON.stringify({version: 1, type: "frequency-term", term, issue: body.issueType, revision: corpus.revision, exampleIds: [...exampleIds], description: body.description.trim(), receiptHash:createHash('sha256').update(receipt).digest('hex')});
    const example = corpus.questions.find(q => q[0] === [...exampleIds][0]);
    const id = randomUUID(), now = Date.now(), questionId = `frequency:${createHash("sha256").update(termStudyKey(term)).digest("hex")}`;
    await queryCloudDatabase("INSERT INTO question_feedback (id, question_id, level, period, category, source, question_number, issue_type, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)", [id, questionId, example?.[2] ?? "", example?.[3] ?? "", "词条", example?.[1] === "original" ? "original" : "imported", null, "other", description, now, now]);
    return cloudJson({ok: true, id, receipt}, 201);
  });
}

/** Receipt holders can check their report without exposing the admin list or other reports. */
export function readFrequencyFeedbackStatus(request:Request) {
  return handleCloudRequest(async()=>{
    requireCloudSameOrigin(request);
    const denied=checkApiRateLimit(request,{scope:'term-feedback-status',limit:30,windowSeconds:60});
    if(denied)return denied;
    const body=await feedbackInput(request,1024);
    if(typeof body.id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.id)||typeof body.receipt!=='string'||!/^[a-f0-9]{64}$/.test(body.receipt))throw new CloudServiceError(400,'反馈回执无效。');
    const rows=await queryCloudDatabase<{question_id:string;description:string;status:string;updated_at:number}>('SELECT question_id, description, status, updated_at FROM question_feedback WHERE id = ?',[body.id]);
    const row=rows[0];let context;
    try{context=row?.question_id.startsWith('frequency:')?JSON.parse(row.description):null;}catch{context=null;}
    if(typeof context?.receiptHash!=='string'||!/^[a-f0-9]{64}$/.test(context.receiptHash)||!timingSafeEqual(Buffer.from(context.receiptHash,'hex'),createHash('sha256').update(body.receipt).digest()))throw new CloudServiceError(404,'未找到对应反馈或回执已失效。');
    return cloudJson({status:row.status,updatedAt:row.updated_at,resolution:context.resolution?{note:context.resolution.note,revision:context.resolution.revision,updatedAt:context.resolution.updatedAt}:null});
  });
}
