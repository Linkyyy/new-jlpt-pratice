import { FrequencyInputError } from './bank-frequency.mjs';

export const frequencyPdfFields = ['rank', 'reading', 'level', 'pos', 'occurrences', 'questions', 'papers', 'meaning', 'usage', 'source'];
export const defaultFrequencyPdfOptions = {
  layout: 'detailed', paper: 'A4', orientation: 'portrait', fontSize: 9,
  fields: [...frequencyPdfFields],
};

export function parseFrequencyPdfOptions(params) {
  const pick = (key, allowed, fallback) => {
    const value = params.get(key) ?? fallback;
    if (!allowed.includes(value)) throw new FrequencyInputError('导出参数无效。');
    return value;
  };
  const raw = params.get('pdfFields');
  const fields = raw === null ? [...frequencyPdfFields] : raw === '' ? [] : raw.split(',');
  if (fields.some(field => !frequencyPdfFields.includes(field)) || new Set(fields).size !== fields.length) throw new FrequencyInputError('导出参数无效。');
  return {
    layout: pick('pdfLayout', ['detailed', 'table'], 'detailed'),
    paper: pick('pdfPaper', ['A4', 'A5'], 'A4'),
    orientation: pick('pdfOrientation', ['portrait', 'landscape'], 'portrait'),
    fontSize: Number(pick('pdfFontSize', ['9', '11', '13'], '9')),
    fields,
  };
}
