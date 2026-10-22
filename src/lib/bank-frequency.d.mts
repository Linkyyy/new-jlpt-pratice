export interface FrequencyTermReview { flags:string[]; reasons:string[]; occurrences:number; questions:number; papers:number }
export interface FrequencyReferenceEvidence { name:string; url:string; revision:string; license:string; levels:string[]; method:string }
export type FrequencyKind = 'word' | 'grammar' | 'idiom' | 'connective';
export interface FrequencySubtype { id: string; category: string; label: string; level?: string; problem?: string; levels?: string[] }
export interface FrequencySummary { excludedFragments?: number; questions: number; papers: number; units: number; terms: number; listeningQuestions: number; transcripts: number; grammarExpressions: number; idiomExpressions?: number }
export interface FrequencyMetadata { referenceSupplementSource?: FrequencyMetadata["referenceSource"]; qualitySummary?: {excludedTerms: number; reasons: Record<string, number>}; referenceExpressionSource?: FrequencyMetadata["referenceSource"]; referenceSource?: {name: string; url: string; revision: string; license: string}; version: number; revision: string; summary: FrequencySummary; levels: string[]; periods: string[]; subtypes: FrequencySubtype[]; definitionSummary?: { matched: number; missing: number; total: number } }
export interface FrequencyFilters { source: string; level: string; grade: string; exclusive: string; period: string; category: string; subtype: string; field: string; kind: FrequencyKind; pos: string; order: string; min: number; max: number; q: string; page: number; size: number }
export interface FrequencyDefinition { senses?:{word:string;meaning:string}[]; meaning: string; usage: string; source: 'wiktionary' | 'editorial' | 'missing'; word?: string }
export interface FrequencyRow { review?:FrequencyTermReview; referenceEvidence?:FrequencyReferenceEvidence[]; partsOfSpeech?: string[]; aliases?: string[]; compound?: boolean; mimetic?: boolean; referenceBasis?: 'reference' | 'supplemental' | 'editorial' | 'ungraded'; referenceLevels: string[]; id: number; label: string; reading: string; pos: string; occurrences: number; questions: number; papers: number; rank: number; definition: FrequencyDefinition }
export interface FrequencyExample { id: string; source: string; level: string; period: string; category: string; subtype: string; number: number | null; available: boolean; fields: string[]; preview?: { prompt: string; passage?: string; options: string[]; excerpts?: {field:string;option?:number;text:string;matches:{start:number;end:number}[]}[] } }
export interface FrequencyResult { revision: string; filters: FrequencyFilters; total: number; totalOccurrences: number; questionCount: number; paperCount: number; unitCount: number; rows: FrequencyRow[]; detail: (Omit<FrequencyRow, 'rank'> & { exampleTotal: number; examplePage: number; exampleSize: number; sourcePapers: { id: number; source: string; level: string; period: string; questions: number }[]; examples: FrequencyExample[] }) | null }
export interface FrequencyCorpus { surfaceForms?:string[][]; termReview?:FrequencyTermReview[]; auditSummary?:Record<string,number>; referenceEvidence?:FrequencyReferenceEvidence[][]; partsOfSpeech?: string[][]; aliases?: string[][]; compounds?: boolean[]; referenceBasis?: string[]; referenceSupplementSource?: FrequencyMetadata["referenceSource"]; qualitySummary?: FrequencyMetadata["qualitySummary"]; referenceExpressionSource?: FrequencyMetadata["referenceSource"]; referenceLevels?: string[][]; referenceSource?: FrequencyMetadata["referenceSource"]; version: number; revision: string; terms: [string, string, string, FrequencyKind][]; questions: [string, string, string, string, string, string, number | null, boolean, number][]; units: [string, number[], number[]][]; papers: string[][]; subtypes: FrequencySubtype[]; summary: FrequencySummary; definitions?: FrequencyDefinition[]; definitionSummary?: {matched: number; missing: number; total: number} }
export const defaultFrequencyFilters: FrequencyFilters;
export const frequencyKinds: string[];
export const frequencyFields: string[];
export const frequencyOrders: string[];
export const frequencyLevelScopes: string[];
export class FrequencyInputError extends Error {}
export function frequencyText(value?: string): string;
export function listeningTranscript(explanation: string[]): string;
export function frequencySearchText(text: string): string;
export function parseFrequencyFilters(params: URLSearchParams, metadata: FrequencyMetadata): FrequencyFilters;
export function frequencyMetadata(corpus: FrequencyCorpus): FrequencyMetadata;
export function queryFrequency(corpus: FrequencyCorpus, filters: FrequencyFilters, selectedTerm?: number, options?: { allRows?: boolean; examplePage?: number; exampleSize?: number; examplePaper?: number }): FrequencyResult;
export function parseFrequencyDetailOptions(params: URLSearchParams, corpus: FrequencyCorpus): { examplePage?: number; exampleSize?: number; examplePaper?: number };
export function frequencySubtype(question: { category: string; instruction?: string; prompt?: string; source?: string; level: string }): FrequencySubtype;

export function frequencySort(order: string): {metric: "occurrences" | "questions" | "papers" | "label"; ascending: boolean; next: string};
