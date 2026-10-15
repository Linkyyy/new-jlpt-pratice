import fs from "node:fs/promises";
import path from "node:path";
import { getAudioObjectKey } from "../src/lib/audio-url.mjs";

/** directory is the resource root containing audio/, not the audio/ folder itself. */
export async function collectAudioFiles(directory) {
  const root = await fs.realpath(directory);
  const files = [];
  async function visit(relative) {
    const absolute = path.join(root, relative);
    if ((await fs.lstat(absolute)).isSymbolicLink()) throw new Error(`不支持符号链接：${relative}`);
    for (const entry of (await fs.readdir(absolute, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw new Error(`不支持符号链接：${path.join(relative, entry.name)}`);
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && /\.mp3$/i.test(entry.name)) {
        const key = child.split(path.sep).join("/");
        // Do not silently rewrite a literal filename containing percent encoding.
        if (getAudioObjectKey(key) !== key) throw new Error(`音频路径无效：${key}`);
        const file = path.join(root, child);
        const size = (await fs.stat(file)).size;
        if (!size) throw new Error(`音频文件为空：${key}`);
        files.push({ key, file, size });
      }
    }
  }
  await visit("audio");
  return files;
}

export function readAudioManifest(input) {
  if (input?.version !== 1 || !Array.isArray(input.keys) || input.keys.some((key) => typeof key !== "string" || getAudioObjectKey(key) !== key)) {
    throw new Error("音频清单格式无效，应为 { version: 1, keys: [\"audio/202412n1/1.mp3\"] }");
  }
  return new Set(input.keys);
}
