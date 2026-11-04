#!/usr/bin/env node
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { fetch, EnvHttpProxyAgent } from 'undici';

const HELP = `用法：
  node download-media.mjs [JSON文件] [选项]

默认读取当前目录的 media-list.json，保存到当前目录的 downloads/。

选项：
  --output <目录>       输出目录（默认 ./downloads）
  --concurrency <数量>  并发下载数，1–32（默认 4）
  --retries <次数>      失败后的重试次数，0–10（默认 2）
  --timeout <秒>        单次下载及转换超时，1–3600（默认 120）
  --quality <质量>      JPG 质量，1–100（默认 90）
  --overwrite          覆盖已有文件，默认跳过已有非空文件
  --help               显示帮助

图片实际转换为 JPEG；name 的扩展名改为 .jpg，无扩展名时追加 .jpg。
音频保留 name。支持 HTTP_PROXY、HTTPS_PROXY 和 NO_PROXY。
失败条目保存为输出目录下的 failed-downloads.json，可再次作为输入运行。`;

function parseArgs(args) {
  const options = { input: 'media-list.json', output: 'downloads', concurrency: 4,
    retries: 2, timeout: 120, quality: 90, overwrite: false };
  const ranges = { concurrency: [1, 32], retries: [0, 10], timeout: [1, 3600], quality: [1, 100] };
  let hasInput = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--overwrite') { options.overwrite = true; continue; }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key !== 'output' && !Object.hasOwn(ranges, key)) throw new Error(`未知选项：${arg}`);
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少参数`);
      if (key === 'output') { options.output = value; continue; }
      const number = Number(value);
      const [min, max] = ranges[key];
      if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${arg} 必须是 ${min}–${max} 的整数`);
      options[key] = number;
    } else {
      if (hasInput) throw new Error(`多余的参数：${arg}`);
      hasInput = true;
      options.input = arg;
    }
  }
  return options;
}

export function prepareTasks(rows) {
  if (!Array.isArray(rows)) throw new Error('输入 JSON 必须是数组');
  const destinations = new Set();
  return rows.map((row, index) => {
    const fail = message => { throw new Error(`第 ${index + 1} 项：${message}`); };
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('必须是对象');
    const media = typeof row.mediaId === 'string' ? row.mediaId.trim() : '';
    const image = typeof row.imageId === 'string' ? row.imageId.trim() : '';
    if (Boolean(media) === Boolean(image)) fail('须包含且只包含一个非空 mediaId 或 imageId');
    const address = new URL(media || image);
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) fail('仅支持无内嵌凭据的 HTTP/HTTPS URL');
    if (typeof row.name !== 'string' || !row.name.trim() || /[\\/\x00-\x1f<>:"|?*]/.test(row.name) || /[. ]$/.test(row.name)) fail('name 必须是合法文件名，不能带目录');
    if (typeof row.folder !== 'string' || !row.folder || row.folder.includes('\\')) fail('folder 必须是相对目录，使用 / 分隔');
    const parts = row.folder.split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || /[\x00-\x1f<>:"|?*]/.test(part) || /[. ]$/.test(part))) fail('folder 含非法目录或路径穿越');
    const extension = path.extname(row.name);
    const name = image ? `${extension ? row.name.slice(0, -extension.length) : row.name}.jpg` : row.name;
    // Also reject case-only collisions so the same input is safe on Windows/macOS.
    const key = [...parts, name].join('/').toLowerCase();
    if (destinations.has(key)) fail(`目标重名：${row.folder}/${name}（图片转 JPG 后也不能重名）`);
    destinations.add(key);
    return { row, url: address.href, image: Boolean(image), parts, name };
  });
}

async function ensureFolder(root, parts) {
  let directory = root;
  for (const part of parts) {
    directory = path.join(directory, part);
    await fs.mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const info = await fs.lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`目标目录不是普通目录：${directory}`);
  }
  return directory;
}

async function existingFile(target) {
  try {
    const info = await fs.lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`目标不是普通文件：${target}`);
    return info;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function saveOne(task, root, options, dispatcher) {
  const directory = await ensureFolder(root, task.parts);
  const target = path.join(directory, task.name);
  const existing = await existingFile(target);
  if (existing?.size && !options.overwrite) {
    if (task.image && (await sharp(target).metadata()).format !== 'jpeg') {
      throw new Error('已有 .jpg 文件实际不是 JPEG，请使用 --overwrite 重新下载转换');
    }
    return 'skipped';
  }
  let lastError;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    const temporary = path.join(directory, `.${task.name}.${randomUUID()}.part`);
    const signal = AbortSignal.timeout(options.timeout * 1000);
    try {
      const response = await fetch(task.url, { dispatcher, signal });
      if (!response.ok) {
        await response.body?.cancel();
        const error = new Error(`HTTP ${response.status} ${response.statusText}`);
        error.retryable = [408, 425, 429].includes(response.status) || response.status >= 500;
        throw error;
      }
      if (!response.body) throw new Error('响应没有内容');
      const type = response.headers.get('content-type') || '';
      if (/text\/html|application\/json/i.test(type)) {
        await response.body.cancel();
        throw new Error(`服务器返回了 ${type}，不是媒体文件`);
      }
      const input = Readable.fromWeb(response.body);
      const output = createWriteStream(temporary, { flags: 'wx' });
      if (task.image) {
        // Apply EXIF orientation; JPEG has no transparency, so flatten onto white.
        await pipeline(input, sharp().rotate().flatten({ background: '#ffffff' })
          .jpeg({ quality: options.quality }), output, { signal });
      } else {
        await pipeline(input, output, { signal });
      }
      if (!(await fs.stat(temporary)).size) throw new Error('下载结果为空文件');
      if (options.overwrite || existing?.size === 0) {
        await fs.rename(temporary, target);
      } else {
        // Atomic no-clobber publication: another process cannot be overwritten.
        await fs.link(temporary, target);
      }
      return 'downloaded';
    } catch (error) {
      lastError = error;
      if (error.code === 'EEXIST') throw new Error(`目标文件已由其他进程创建：${target}`);
      if (error.retryable === false || attempt === options.retries) break;
      console.warn(`重试 ${attempt + 1}/${options.retries}：${task.parts.join('/')}/${task.name}：${error.message}`);
      await delay(500 * 2 ** attempt);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  throw lastError;
}

export async function downloadList(options) {
  const rows = JSON.parse((await fs.readFile(path.resolve(options.input), 'utf8')).replace(/^\uFEFF/, ''));
  const tasks = prepareTasks(rows);
  await fs.mkdir(path.resolve(options.output), { recursive: true });
  const root = await fs.realpath(path.resolve(options.output));
  const dispatcher = new EnvHttpProxyAgent();
  const counts = { total: tasks.length, downloaded: 0, skipped: 0, failed: 0 };
  const failures = [];
  let next = 0;
  try {
    const worker = async () => {
      while (next < tasks.length) {
        const task = tasks[next++];
        const label = `${task.parts.join('/')}/${task.name}`;
        try {
          const status = await saveOne(task, root, options, dispatcher);
          counts[status]++;
          console.log(`[${status === 'skipped' ? '跳过' : '完成'}] ${label}`);
        } catch (error) {
          counts.failed++;
          failures.push({ ...task.row, downloadError: error.message });
          console.error(`[失败] ${label}：${error.message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.concurrency, tasks.length) }, worker));
    await fs.writeFile(path.join(root, 'failed-downloads.json'), JSON.stringify(failures, null, 2) + '\n');
  } finally {
    await dispatcher.close();
  }
  console.log(`完成：成功 ${counts.downloaded}，跳过 ${counts.skipped}，失败 ${counts.failed}。输出目录：${root}`);
  return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(HELP);
    else {
      const counts = await downloadList(options);
      if (counts.failed) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  }
}
