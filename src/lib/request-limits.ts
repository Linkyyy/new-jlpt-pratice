import { createHash } from "node:crypto";
import { isIP } from "node:net";

type LimitOptions = { scope: string; limit: number; windowSeconds: number; key?: string };
type Counter = { count: number; expiresAt: number };

export class HttpRequestError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter?: number) { super(message); }
}

/** Trust IP headers only when our hosting proxy is responsible for replacing them. */
export function requestClientIp(request: Request): string {
  const forwarded = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for")
    : process.env.TRUST_PROXY_IP_HEADERS === "true" ? request.headers.get("x-forwarded-for") : null;
  const candidate = forwarded?.split(",")[0].trim() ?? "";
  return isIP(candidate) ? candidate : "unknown";
}

/** A bounded, instance-local burst guard. Durable/edge limits are still required for global quotas. */
export function createMemoryRateLimiter(maxEntries = 10000, clock = Date.now) {
  const counters = new Map<string, Counter>();
  let nextSweep = 0;
  return (key: string, limit: number, windowSeconds: number): number | null => {
    const now = clock(), interval = windowSeconds * 1000;
    if (now >= nextSweep) {
      for (const [storedKey, counter] of counters) if (counter.expiresAt <= now) counters.delete(storedKey);
      nextSweep = now + 30000;
    }
    const window = Math.floor(now / interval), expiresAt = (window + 1) * interval;
    const storedKey = createHash("sha256").update(`${key}:${windowSeconds}:${window}`).digest("hex");
    const current = counters.get(storedKey);
    if (current && current.count >= limit) return Math.max(1, Math.ceil((current.expiresAt - now) / 1000));
    // Keep memory bounded even if an attacker changes an untrusted identifier on every request.
    if (!current && counters.size >= maxEntries) return Math.max(1, Math.ceil((nextSweep - now) / 1000));
    counters.set(storedKey, { count: (current?.count ?? 0) + 1, expiresAt });
    return null;
  };
}

const consume = createMemoryRateLimiter();

export function apiErrorResponse(error: unknown): Response {
  const known = error instanceof HttpRequestError;
  return Response.json({ error: known ? error.message : "服务暂时不可用，请稍后重试。" }, {
    status: known ? error.status : 503,
    headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", ...(known && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) },
  });
}

export function checkApiRateLimit(request: Request, options: LimitOptions): Response | null {
  const retryAfter = consume(`${options.scope}:${options.key ?? requestClientIp(request)}`, options.limit, options.windowSeconds);
  return retryAfter === null ? null : apiErrorResponse(new HttpRequestError(429, "操作过于频繁，请稍后重试。", retryAfter));
}

/** Enforce the actual streamed byte length too: Content-Length may be absent or false. */
export async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new HttpRequestError(415, "请求格式无效。");
  if (Number(request.headers.get("content-length")) > maxBytes) throw new HttpRequestError(413, "请求过大");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpRequestError(400, "无效 JSON");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new HttpRequestError(413, "请求过大"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof HttpRequestError) throw error;
    throw new HttpRequestError(400, "无效 JSON");
  } finally { reader.releaseLock(); }
}
