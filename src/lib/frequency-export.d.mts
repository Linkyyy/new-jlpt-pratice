import type { FrequencyMetadata, FrequencyFilters, FrequencyResult } from './bank-frequency.mjs';
import type { FrequencyPdfOptions } from './frequency-pdf-options.mjs';
export const frequencyExportLimit: number;
export function frequencyExportDescription(filters: FrequencyFilters, metadata: FrequencyMetadata, locale?: 'zh' | 'ja' | 'en'): string;
export function createFrequencyWorkbook(result: FrequencyResult, metadata: FrequencyMetadata, locale?: 'zh' | 'ja' | 'en', now?: Date): Promise<Buffer>;
export function createFrequencyPdf(result: FrequencyResult, metadata: FrequencyMetadata, locale?: 'zh' | 'ja' | 'en', now?: Date, fontPath?: string, options?: FrequencyPdfOptions): Promise<Buffer>;
