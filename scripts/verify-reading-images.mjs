import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {getImageObjectKey, getImageUrl} from '../src/lib/image-url.mjs';
import {defaultAudioBaseUrl} from '../src/lib/audio-url.mjs';

export function verifiedReadingImageKeys(report) {
  assert(report?.version === 1 && report.status === 'passed' && Array.isArray(report.images) && report.images.length, 'Reading images must pass verification before activation');
  assert(Number.isFinite(Date.parse(report.checkedAt)), 'Missing image verification time');
  const keys = new Set();
  for (const image of report.images) {
    assert(getImageObjectKey(image.key) === image.key && image.url === getImageUrl(image.key, report.baseUrl), 'Invalid verified image reference');
    assert(image.status === 'available' && image.httpStatus === 200 && image.bytes > 0 && image.width >= 16 && image.height >= 16 && /^[a-f0-9]{64}$/.test(image.sha256 ?? ''), 'Unverified or invalid image');
    assert(!keys.has(image.key), 'Duplicate verified image'); keys.add(image.key);
  }
  return keys;
}

/** Fetch and decode the actual image, not just its filename or successful HEAD. */
export async function verifyReadingImages(checklist, {baseUrl = process.env.NEXT_PUBLIC_AUDIO_BASE_URL || defaultAudioBaseUrl,
  fetcher = fetch, downloadDirectory, maximumBytes = 16 * 1024 * 1024} = {}) {
  assert(Array.isArray(checklist?.images) && checklist.images.length, 'Missing reading image checklist');
  const keys = [...new Set(checklist.images.map(image => image.uploadPath))];
  assert(keys.every(key => getImageObjectKey(key) === key && getImageUrl(key, baseUrl)), 'Invalid checklist image path or base URL');
  const images = Array(keys.length); let cursor = 0;
  await Promise.all(Array.from({length: Math.min(3, keys.length)}, async () => {
    while (cursor < keys.length) {
      const index = cursor++, key = keys[index], url = getImageUrl(key, baseUrl);
      let response;
      try {
        response = await fetcher(url, {cache: 'no-store', credentials: 'omit', redirect: 'error', headers: {Accept: 'image/jpeg,image/png,image/webp,image/gif'}, signal: AbortSignal.timeout(12000)});
        const contentType = response.headers.get('content-type') || '';
        if (response.status !== 200) {
          await response.body?.cancel();
          images[index] = {key, url, status: response.status === 404 ? 'missing' : 'http-error', httpStatus: response.status, contentType}; continue;
        }
        if (!/^image\/(?:jpeg|png|webp|gif)(?:;|$)/i.test(contentType)) throw new Error('Response is not a supported image');
        if (Number(response.headers.get('content-length')) > maximumBytes) throw new Error('Image exceeds verification size limit');
        const chunks = []; let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.byteLength;
          if (bytes > maximumBytes) throw new Error('Image exceeds verification size limit');
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const decoder = sharp(buffer, {limitInputPixels: 40_000_000, failOn: 'warning'});
        const metadata = await decoder.metadata();
        assert(metadata.width >= 16 && metadata.height >= 16, 'Image is empty or only a placeholder');
        await decoder.raw().toBuffer();
        const sha256 = createHash('sha256').update(buffer).digest('hex');
        images[index] = {key, url, status: 'available', httpStatus: response.status, contentType, bytes, format: metadata.format, width: metadata.width, height: metadata.height, sha256};
        if (downloadDirectory) {
          const destination = path.join(downloadDirectory, key);
          await fs.mkdir(path.dirname(destination), {recursive: true}); await fs.writeFile(destination, buffer);
        }
      } catch (error) {
        try { await response?.body?.cancel(); } catch { /* The stream may already be closed after decoding. */ }
        images[index] = {key, url, status: response ? 'invalid-image' : 'unreachable', httpStatus: response?.status ?? null,
          error: error instanceof Error ? error.message : 'Image check failed'};
      }
    }
  }));
  return {version: 1, checkedAt: new Date().toISOString(), baseUrl, status: images.every(image => image.status === 'available') ? 'passed' : 'failed', images};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); assert(index < 0 || args[index + 1] && !args[index + 1].startsWith('--'), `${name} requires a value`); return index < 0 ? null : args[index + 1]; };
  const checklist = JSON.parse(await fs.readFile(path.resolve(value('--checklist') ?? 'docs/exam-bank-missing-images-2026-10-22.json'), 'utf8'));
  const output = path.resolve(value('--output') ?? '/tmp/jlpt-reading-image-verification.json');
  const report = await verifyReadingImages(checklist, {baseUrl: value('--base-url') ?? undefined, downloadDirectory: value('--download-dir')});
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({status: report.status, output, images: report.images}, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
}
