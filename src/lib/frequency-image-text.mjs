import {getImageObjectKey} from './image-url.mjs';

/** Sidecar text only: never alter the displayed question, answer, or image. */
export function createImageTextIndex(input) {
  if (input?.version !== 1 || !Array.isArray(input.images)) throw new Error('Invalid image OCR data');
  const result = new Map();
  for (const image of input.images) {
    if (image.reviewed !== true) continue;
    if (getImageObjectKey(image.key) !== image.key || !/^[a-f0-9]{64}$/.test(image.sha256 ?? '')
      || typeof image.text !== 'string' || !image.text.trim() || image.text.length > 50000
      || !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(image.text)
      || /<[^>]*>|[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(image.text)
      || result.has(image.key)) throw new Error(`Invalid or duplicate reviewed OCR text: ${image.key}`);
    result.set(image.key, image);
  }
  return result;
}

export function questionImageReferences(question) {
  const passage = question.category === '阅读' || question.category === '语法';
  const seen = new Set();
  return [
    ...(question.media?.images ?? []).map(key => ({key, field: passage ? 'passage' : 'prompt'})),
    ...(question.media?.questionImages ?? []).map(key => ({key, field: 'prompt'})),
  ].filter(({key}) => { if (getImageObjectKey(key) !== key || seen.has(key)) return false; seen.add(key); return true; });
}

export function withFrequencyImageText(question, index) {
  return {...question, imageTexts: questionImageReferences(question).flatMap(({key, field}) => {
    const image = index.get(key);
    return image ? [{key, field, text: image.text}] : [];
  })};
}
