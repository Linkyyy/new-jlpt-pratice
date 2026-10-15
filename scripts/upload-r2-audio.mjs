import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { collectAudioFiles } from "./r2-audio-files.mjs";

const { values } = parseArgs({ options: {
  directory: { type: "string" }, manifest: { type: "string", default: "r2-audio-manifest.json" },
  "dry-run": { type: "boolean", default: false }, help: { type: "boolean", default: false },
} });
if (values.help) {
  console.log("node --env-file=.env.r2.local scripts/upload-r2-audio.mjs --directory <含 audio/ 的资源根目录> [--manifest r2-audio-manifest.json] [--dry-run]");
  process.exit(0);
}
if (!values.directory) throw new Error("请提供 --directory <含 audio/ 的资源根目录>；可先使用 --dry-run 检查。");
const files = await collectAudioFiles(path.resolve(values.directory));
if (!files.length) throw new Error("audio/ 下没有非空 MP3 文件。");
console.log(`${files.length} 个 MP3，共 ${(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)} MiB`);
if (values["dry-run"]) {
  for (const file of files) console.log(`${file.key} (${file.size} bytes)`);
  console.log("仅检查：未连接 R2，未上传，也未生成已上传清单。");
  process.exit(0);
}

const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`缺少环境变量：${missing.join(", ")}`);
if (!/^[a-f\d]{32}$/i.test(process.env.R2_ACCOUNT_ID)) throw new Error("R2_ACCOUNT_ID 格式无效。");
const client = new S3Client({
  region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  maxAttempts: 1, // Re-open the stream for each retry rather than reusing a consumed body.
});
let next = 0;
async function upload() {
  while (next < files.length) {
    const file = files[next++];
    for (let attempt = 1; ; attempt++) {
      const body = createReadStream(file.file);
      try {
        await client.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME, Key: file.key, Body: body, ContentLength: file.size,
          ContentType: "audio/mpeg", CacheControl: "public, max-age=86400",
        }));
        console.log(`已上传 ${file.key}`);
        break;
      } catch (failure) {
        if (attempt === 3) throw new Error(`上传失败：${file.key}（${failure.name ?? "网络错误"}）`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      } finally { body.destroy(); }
    }
  }
}
// Bound concurrent streams to keep memory usage independent of the total bank size.
const results = await Promise.allSettled(Array.from({ length: Math.min(4, files.length) }, upload));
client.destroy();
const failed = results.find((result) => result.status === "rejected");
if (failed) throw failed.reason;
const destination = path.resolve(values.manifest);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, JSON.stringify({ version: 1, keys: files.map((file) => file.key) }, null, 2) + "\n");
console.log(`上传完成。已上传对象清单：${destination}`);
