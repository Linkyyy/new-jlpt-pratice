import type {FrequencyCorpus} from './bank-frequency.mjs';
export function annotateFrequencyAudit(corpus:FrequencyCorpus,dictionary:Record<string,{word:string;pos:string;readings:string[];glosses:string[]}[]>): Record<string,number>;
