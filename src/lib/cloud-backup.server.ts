import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { isLearningBackup, isRecord } from "./backup-validation";

const COOKIE = "jlpt-cloud-session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const MAX_CLOUD_BACKUP_BYTES = 1024 * 1024; // D1 limits a row to 2 MB; leave headroom.
type Row = Record<string, unknown>;
class CloudError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function config() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, database = process.env.CLOUDFLARE_D1_DATABASE_ID, token = process.env.CLOUDFLARE_D1_API_TOKEN;
  return account && database && token ? { account, database, token } : null;
}
async function query<T extends Row = Row>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
  const env = config();
  if (!env) throw new CloudError(503, "云备份尚未配置，请联系站点管理员。");
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.account)}/d1/database/${encodeURIComponent(env.database)}/query`, {
      method: "POST", headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }), cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    if (!response.ok || !body.success || !body.result?.[0]?.success || !Array.isArray(body.result[0].results)) throw new Error("D1 request failed");
    return body.result[0].results as T[];
  } catch { throw new CloudError(503, "云服务暂时不可用，请稍后重试。"); }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function passwordKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await passwordKey(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split(":");
  if (scheme !== "scrypt-v1" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{64}$/.test(key ?? "")) return false;
  return timingSafeEqual(await passwordKey(password, salt), Buffer.from(key, "hex"));
}
function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new CloudError(403, "请求来源无效，请从本站重试。");
}
async function input(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new CloudError(415, "请求格式无效。");
  if (Number(request.headers.get("content-length")) > maxBytes) throw new CloudError(413, "备份过大，请使用文件导出保存。");
  const reader = request.body?.getReader();
  if (!reader) throw new CloudError(400, "请求格式无效。");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new CloudError(413, "备份过大，请使用文件导出保存。"); }
      chunks.push(part.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!isRecord(value)) throw new Error("Invalid body");
    return value;
  } catch (error) { if (error instanceof CloudError) throw error; throw new CloudError(400, "请求格式无效。"); }
  finally { reader.releaseLock(); }
}
function cookie(request: Request): string | null {
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
async function session(request: Request) {
  const token = cookie(request);
  if (!token) return null;
  const users = await query<{ id: string; username: string }>("SELECT u.id, u.username FROM cloud_sessions s JOIN cloud_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?", [hash(token), Date.now()]);
  return users[0] ?? null;
}
async function requireSession(request: Request) {
  const user = await session(request);
  if (!user) throw new CloudError(401, "请先登录云备份账号。");
  return user;
}
async function rateLimit(scope: string, key: string, limit: number, seconds: number) {
  const now = Date.now(), window = Math.floor(now / (seconds * 1000));
  await query("DELETE FROM cloud_rate_limits WHERE key IN (SELECT key FROM cloud_rate_limits WHERE expires_at <= ? LIMIT 100)", [now]);
  const result = await query<{ count: number }>("INSERT INTO cloud_rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count", [hash(`${scope}:${key}:${window}`), (window + 1) * seconds * 1000]);
  if (result[0].count > limit) throw new CloudError(429, "操作过于频繁，请稍后重试。");
}
const json = (value: unknown, status = 200, headers?: HeadersInit) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", ...headers } });
async function handle(operation: () => Promise<Response>) {
  try { return await operation(); }
  catch (error) {
    return error instanceof CloudError ? json({ error: error.message }, error.status) : json({ error: "云服务暂时不可用，请稍后重试。" }, 503);
  }
}
async function metadata(userId: string) {
  const rows = await query("SELECT revision, saved_at AS savedAt, bytes FROM cloud_backups WHERE user_id = ?", [userId]);
  return rows[0] ?? null;
}
export function cloudStatus(request: Request) {
  return handle(async () => {
    if (!config()) return json({ configured: false, user: null, backup: null });
    const user = await session(request);
    return json({ configured: true, user: user ? { username: user.username } : null, backup: user ? await metadata(user.id) : null });
  });
}
export function cloudAuth(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const body = await input(request, 4096);
    if (body.action === "logout") {
      const token = cookie(request);
      if (token) await query("DELETE FROM cloud_sessions WHERE token_hash = ?", [hash(token)]);
      return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` });
    }
    if (body.action !== "login" && body.action !== "register") throw new CloudError(400, "请求格式无效。");
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = body.password;
    if (!/^[a-z0-9_]{3,32}$/.test(username) || typeof password !== "string" || password.length < 8 || password.length > 128) throw new CloudError(400, "账号需为 3–32 位字母、数字或下划线，密码需为 8–128 位。");
    const ip = (request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    await rateLimit("auth-ip", ip, 30, 900);
    await rateLimit("auth-account", username, 15, 900);
    let user: { id: string; username: string };
    if (body.action === "register") {
      await rateLimit("register-ip", ip, 5, 3600);
      const users = await query<{ id: string; username: string }>("INSERT INTO cloud_users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(username) DO NOTHING RETURNING id, username", [randomUUID(), username, await hashPassword(password), Date.now()]);
      if (!users.length) throw new CloudError(409, "账号已存在，请登录。");
      user = users[0];
    } else {
      const users = await query<{ id: string; username: string; password_hash: string }>("SELECT id, username, password_hash FROM cloud_users WHERE username = ?", [username]);
      // Use the same expensive comparison for unknown usernames.
      const matches = await verifyPassword(password, users[0]?.password_hash ?? `scrypt-v1:${"0".repeat(32)}:${"0".repeat(64)}`);
      if (!users[0] || !matches) throw new CloudError(401, "账号或密码不正确。");
      user = users[0];
    }
    const token = randomBytes(32).toString("base64url");
    await query("DELETE FROM cloud_sessions WHERE expires_at <= ?", [Date.now()]);
    await query("INSERT INTO cloud_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [hash(token), user.id, Date.now() + SESSION_SECONDS * 1000]);
    return json({ configured: true, user: { username: user.username }, backup: await metadata(user.id) }, 200, { "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` });
  });
}
export function cloudRead(request: Request) {
  return handle(async () => {
    const user = await requireSession(request);
    if (new URL(request.url).searchParams.get("account") !== user.username) throw new CloudError(409, "登录账号已变化，请刷新后重试。");
    const rows = await query<{ data: string; revision: string; savedAt: number; bytes: number }>("SELECT data, revision, saved_at AS savedAt, bytes FROM cloud_backups WHERE user_id = ?", [user.id]);
    if (!rows[0]) throw new CloudError(404, "这个账号还没有云备份。");
    const { data, ...info } = rows[0]; const backup: unknown = JSON.parse(data);
    if (!isLearningBackup(backup)) throw new CloudError(422, "云备份格式无效，本地记录未修改。");
    return json({ data: backup, backup: info });
  });
}
export function cloudWrite(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const user = await requireSession(request);
    await rateLimit("backup", user.id, 20, 60);
    const body = await input(request, MAX_CLOUD_BACKUP_BYTES + 4096);
    if (body.expectedUsername !== user.username) throw new CloudError(409, "登录账号已变化，请刷新后重试。");
    if (!isLearningBackup(body.data) || !(body.expectedRevision === null || typeof body.expectedRevision === "string" && body.expectedRevision.length <= 100)) throw new CloudError(400, "备份格式无效，云端记录未修改。");
    const data = JSON.stringify(body.data), bytes = Buffer.byteLength(data, "utf8");
    if (bytes > MAX_CLOUD_BACKUP_BYTES) throw new CloudError(413, "备份过大，请使用文件导出保存。");
    const revision = randomUUID(), savedAt = Date.now();
    const rows = body.expectedRevision === null
      ? await query("INSERT INTO cloud_backups (user_id, data, revision, saved_at, bytes) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING RETURNING revision", [user.id, data, revision, savedAt, bytes])
      : await query("UPDATE cloud_backups SET data = ?, revision = ?, saved_at = ?, bytes = ? WHERE user_id = ? AND revision = ? RETURNING revision", [data, revision, savedAt, bytes, user.id, body.expectedRevision]);
    if (!rows.length) throw new CloudError(409, "云备份已在其他设备更新，请刷新后重试。");
    return json({ ok: true, backup: { revision, savedAt, bytes } });
  });
}
