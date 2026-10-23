import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {getImageObjectKey} from '../src/lib/image-url.mjs';
import {createImageTextIndex, questionImageReferences} from '../src/lib/frequency-image-text.mjs';
import {verifyReadingImages} from './verify-reading-images.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const sourceDirectory = path.join(root, 'src/data/imported-bank/questions');
const entriesFile = path.join(root, 'src/data/frequency-image-ocr/entries.json');

export function normalizeJapaneseOcr(text) {
  return text.normalize('NFKC').replaceAll('\r','')
    .replace(/<([^<>]{1,60})>/g,'【$1】')
    .replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々])[^\S\n]+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々])/gu,'')
    .replace(/[^\S\n]+(?=[。、！？])/gu,'').trim();
}

export async function collectImageChecklist(directory = sourceDirectory) {
  const images = new Map();
  for (const file of (await fs.readdir(directory)).filter(name => /^\d{6}-N[1-5]-[1-4]\.json$/.test(name)).sort()) {
    const bank = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
    const missing = (bank.unavailable ?? []).map(question => ({id: question.id, category: {vocabulary:'词汇',grammar:'语法',reading:'阅读',listening:'听力'}[bank.type],
      media: {images: question.raw?.picture ? [question.raw.picture] : [], questionImages: question.raw?.questionPicture ? [question.raw.questionPicture] : []}}));
    for (const question of [...bank.questions, ...missing]) for (const {key, field} of questionImageReferences(question)) {
      if (!images.has(key)) images.set(key, {uploadPath:key, questions:[]});
      images.get(key).questions.push({id:question.id, field});
    }
  }
  return {images: [...images.values()]};
}

export function ocrConfidence(tsv) {
  let total = 0, weight = 0;
  for (const line of tsv.split('\n').slice(1)) {
    const fields = line.split('\t'), confidence = Number(fields[10]), text = fields.slice(11).join('\t').trim();
    if (fields[0] !== '5' || !text || !Number.isFinite(confidence) || confidence < 0) continue;
    total += confidence * text.length; weight += text.length;
  }
  return weight ? Math.round(total / weight * 100) / 100 : 0;
}

/** Offline Japanese OCR. Image bytes and native OCR tools never enter the deployment. */
export async function recognizeImage(filename, {tessdataDirectory, cacheDirectory = '/tmp/jlpt-image-ocr/work', pageSegmentation = 3, preprocess = true} = {}) {
  assert([3,6,11,12].includes(pageSegmentation), 'Unsupported OCR page segmentation mode');
  const bytes = await fs.readFile(filename);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const model = tessdataDirectory ? ['--tessdata-dir', path.resolve(tessdataDirectory)] : [];
  await fs.mkdir(cacheDirectory, {recursive:true});
  const prefix = path.join(cacheDirectory, sha256), prepared = `${prefix}.png`;
  const source = sharp(bytes, {limitInputPixels:40_000_000,failOn:'warning'});
  const metadata = await source.metadata();
  assert(metadata.width >= 16 && metadata.height >= 16, 'Image is too small for OCR');
  await source.rotate().flatten({background:'#ffffff'}).resize({width:Math.min(3000, Math.max(metadata.width, 2200)), withoutEnlargement:false})
    .grayscale().normalize().sharpen().png().toFile(prepared);
  await run('tesseract', [preprocess ? prepared : filename, prefix, ...model, '-l', 'jpn', '--psm', String(pageSegmentation), '-c', 'tessedit_create_txt=1', '-c', 'tessedit_create_tsv=1'],
    {timeout:60000, maxBuffer:1024*1024, env:{...process.env, OMP_THREAD_LIMIT:'1'}});
  const [text, tsv] = await Promise.all([fs.readFile(`${prefix}.txt`, 'utf8'), fs.readFile(`${prefix}.tsv`, 'utf8')]);
  return {sha256, text:normalizeJapaneseOcr(text), confidence:ocrConfidence(tsv),
    engine:`tesseract-jpn-psm${pageSegmentation}`, reviewed:false};
}

export async function importReviewedImageText(input, output = entriesFile) {
  const approved = createImageTextIndex(input);
  assert(approved.size, 'No reviewed OCR entries to import; inspect images and correct the draft first');
  let existing = {version:1, images:[]};
  try { existing = JSON.parse(await fs.readFile(output,'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const combined = createImageTextIndex(existing);
  for (const [key, image] of approved) combined.set(key, image);
  const result = {version:1, images:[...combined.values()].sort((a,b)=>a.key.localeCompare(b.key))};
  await fs.mkdir(path.dirname(output), {recursive:true});
  await fs.writeFile(`${output}.tmp`, `${JSON.stringify(result,null,2)}\n`); await fs.rename(`${output}.tmp`, output);
  return {imported:approved.size, total:combined.size};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); assert(index < 0 || args[index+1] && !args[index+1].startsWith('--'), `${name} requires a value`); return index < 0 ? undefined : args[index+1]; };
  const reviewed = value('--import');
  if (reviewed) {
    console.log(await importReviewedImageText(JSON.parse(await fs.readFile(path.resolve(reviewed),'utf8')), value('--output')));
  } else {
    const checklist = value('--checklist') ? JSON.parse(await fs.readFile(path.resolve(value('--checklist')),'utf8')) : await collectImageChecklist();
    assert(Array.isArray(checklist.images) && checklist.images.length, 'Empty OCR image checklist');
    const keys = [...new Set(checklist.images.map(image=>image.uploadPath))];
    assert(keys.every(key=>getImageObjectKey(key)===key), 'Invalid OCR image path');
    const directory = path.resolve(value('--image-dir') ?? '/tmp/jlpt-image-ocr/images');
    let downloaded;
    if (args.includes('--download')) {
      const report = await verifyReadingImages(checklist, {downloadDirectory:directory, baseUrl:value('--base-url')});
      downloaded = new Map(report.images.map(image=>[image.key,image]));
      await fs.mkdir(directory,{recursive:true}); await fs.writeFile(path.join(directory,'download-report.json'),`${JSON.stringify(report,null,2)}\n`);
    }
    const images = [];
    for (const key of keys) {
      try {
        if (downloaded && downloaded.get(key)?.status !== 'available') throw new Error(`Image download failed: ${downloaded.get(key)?.status ?? 'unavailable'}`);
        const result = await recognizeImage(path.join(directory,key), {tessdataDirectory:value('--tessdata-dir')}); images.push({key,...result}); console.log(`${key}: OCR ${result.confidence}% · 待校对`);
      }
      catch (error) { images.push({key,reviewed:false,error:error.code === 'ENOENT' ? 'Missing image file or OCR executable' : error.message}); console.error(`${key}: ${images.at(-1).error}`); }
    }
    const output = path.resolve(value('--output') ?? '/tmp/jlpt-image-ocr/draft.json');
    await fs.mkdir(path.dirname(output),{recursive:true});
    await fs.writeFile(output,`${JSON.stringify({version:1,generatedAt:new Date().toISOString(),images},null,2)}\n`);
    console.log(JSON.stringify({output,images:images.length,recognized:images.filter(image=>image.text).length,reviewed:0}));
    if (images.some(image=>image.error || !image.text)) process.exitCode = 1;
  }
}
