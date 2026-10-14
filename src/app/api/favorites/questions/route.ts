import { loadFavoriteQuestions } from "@/data/imported-papers.server";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 30000) return Response.json({ error: "请求过大" }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "无效 JSON" }, { status: 400 }); }
  if (typeof body !== "object" || body === null || !("ids" in body) || !Array.isArray(body.ids) || body.ids.length > 100) return Response.json({ error: "每次最多读取 100 个题目 ID" }, { status: 400 });
  const ids: unknown[] = body.ids;
  if (!ids.every((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200)) return Response.json({ error: "无效题目 ID" }, { status: 400 });
  return Response.json({ questions: await loadFavoriteQuestions([...new Set(ids)]) });
}
