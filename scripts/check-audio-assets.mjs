import fs from "node:fs/promises";
import path from "node:path";

async function check(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await check(file);
    else if (/\.(mp3|m4a|wav|ogg)$/i.test(entry.name)) throw new Error(`音频不能打包进 Vercel：${file}。请上传至 R2，并从 public/ 移除。`);
  }
}
await check(path.join(process.cwd(), "public"));
console.log("通过：public/ 不含音频文件，录音由 R2 直接提供。");
