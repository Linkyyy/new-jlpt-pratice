import { cookies } from "next/headers";
import { PASSPHRASE_REQUIRED } from "@/lib/access-config.server";
import { ACTIVATION_COOKIE, ACTIVATION_MAX_AGE, normalizeActivationCode, verifyActivationCode } from "@/lib/activation.server";
import { apiErrorResponse, checkApiRateLimit, readLimitedJson } from "@/lib/request-limits";

export async function POST(request: Request) {
  if (!PASSPHRASE_REQUIRED) return Response.json({ activated: true, required: false }, { headers: { "Cache-Control": "no-store" } });
  const limited = checkApiRateLimit(request, { scope: "activation", limit: 20, windowSeconds: 60 });
  if (limited) return limited;
  let input: unknown;
  try { input = await readLimitedJson(request, 1000); } catch (error) { return apiErrorResponse(error); }
  const code = typeof input === "object" && input !== null && "code" in input ? input.code : null;
  if (!verifyActivationCode(code)) return Response.json({ error: "暗号不正确，请检查后重试。" }, { status: 401 });
  (await cookies()).set(ACTIVATION_COOKIE, normalizeActivationCode(code as string), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: ACTIVATION_MAX_AGE,
  });
  return Response.json({ activated: true }, { headers: { "Cache-Control": "no-store" } });
}
