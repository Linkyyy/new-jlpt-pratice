import type {FrequencyExample} from './bank-frequency.mjs';
export function frequencyExcerpt(input: string, forms: string[], limit?: number): {text:string;matches:{start:number;end:number}[]}|null;
export function frequencyExamplePreview(question:{prompt:string;passage?:string;explanation:readonly string[];options:readonly {text:string}[];imageTexts?:{key:string;field:string;text:string}[]}, fields:string[], forms:string[]): NonNullable<FrequencyExample['preview']>;
