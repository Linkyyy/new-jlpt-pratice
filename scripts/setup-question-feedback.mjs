import { readFile } from "node:fs/promises";

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const database = process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_D1_API_TOKEN;
if (!account || !database || !token) {
  console.error("请先配置 CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_D1_DATABASE_ID 和 CLOUDFLARE_D1_API_TOKEN。");
  process.exit(1);
}
const schema = await readFile(new URL("../migrations/0002-question-feedback.sql", import.meta.url), "utf8");
for (const sql of schema.split(";").map(sql => sql.trim()).filter(Boolean)) {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(database)}/query`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params: [] }), signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok || !body.success || !body.result?.every(result => result.success)) throw new Error("Cloudflare request failed");
  } catch {
    console.error("反馈表初始化失败，请检查网络、数据库 ID 和 D1 编辑权限。脚本可重复运行，不会删除已有数据。");
    process.exit(1);
  }
}
console.log("题目反馈表已初始化。请在 Vercel 配置 FEEDBACK_ADMIN_USERS 后重新部署。");
