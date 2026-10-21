export type FrequencyPdfField = 'rank' | 'reading' | 'level' | 'pos' | 'occurrences' | 'questions' | 'papers' | 'meaning' | 'usage' | 'source';
export interface FrequencyPdfOptions {
  layout: 'detailed' | 'table';
  paper: 'A4' | 'A5';
  orientation: 'portrait' | 'landscape';
  fontSize: 9 | 11 | 13;
  fields: FrequencyPdfField[];
}
export const frequencyPdfFields: FrequencyPdfField[];
export const defaultFrequencyPdfOptions: FrequencyPdfOptions;
export function parseFrequencyPdfOptions(params: URLSearchParams): FrequencyPdfOptions;
