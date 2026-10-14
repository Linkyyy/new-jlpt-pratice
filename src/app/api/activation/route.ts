import { cookies } from "next/headers";
import { ACTIVATION_COOKIE, ACTIVATION_MAX_AGE, normalizeActivationCode, verifyActivationCode } from "@/lib/activation.server";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 1000) return Response.json({ error: "请求过大" }, { status: 413 });
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "无效请求" }, { status: 400 }); }
  const code = typeof input === "object" && input !== null && "code" in input ? input.code : null;
  if (!verifyActivationCode(code)) return Response.json({ error: "激活码不正确，请检查后重试。" }, { status: 401 });
  (await cookies()).set(ACTIVATION_COOKIE, normalizeActivationCode(code as string), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: ACTIVATION_MAX_AGE,
  });
  return Response.json({ activated: true }, { headers: { "Cache-Control": "no-store" } });
}
