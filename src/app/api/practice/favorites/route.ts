import { loadFavoriteQuestions } from "@/data/imported-papers.server";
import { apiErrorResponse, checkApiRateLimit, readLimitedJson } from "@/lib/request-limits";

export async function POST(request: Request) {
  const limited = checkApiRateLimit(request, { scope: "favorite-question-data", limit: 120, windowSeconds: 60 });
  if (limited) return limited;
  let body: unknown;
  try { body = await readLimitedJson(request, 30000); } catch (error) { return apiErrorResponse(error); }
  if (typeof body !== "object" || body === null || !("ids" in body) || !Array.isArray(body.ids) || body.ids.length > 100) return Response.json({ error: "每次最多读取 100 个题目 ID" }, { status: 400 });
  const ids: unknown[] = body.ids;
  if (!ids.every((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200)) return Response.json({ error: "无效题目 ID" }, { status: 400 });
  return Response.json({ questions: await loadFavoriteQuestions([...new Set(ids)]) });
}
