export type FrequencyKind = 'word' | 'grammar' | 'connective';
export interface FrequencySubtype { id: string; category: string; label: string; level?: string; problem?: string }
export interface FrequencySummary { questions: number; papers: number; units: number; terms: number; listeningQuestions: number; transcripts: number; grammarExpressions: number }
export interface FrequencyMetadata { version: number; revision: string; summary: FrequencySummary; levels: string[]; periods: string[]; subtypes: FrequencySubtype[] }
export interface FrequencyFilters { source: string; level: string; period: string; category: string; subtype: string; field: string; kind: FrequencyKind; pos: string; order: string; min: number; q: string; page: number; size: number }
export interface FrequencyRow { id: number; label: string; reading: string; pos: string; occurrences: number; questions: number; papers: number; rank: number }
export interface FrequencyExample { id: string; source: string; level: string; period: string; category: string; subtype: string; number: number | null; available: boolean }
export interface FrequencyResult { revision: string; filters: FrequencyFilters; total: number; totalOccurrences: number; questionCount: number; paperCount: number; unitCount: number; rows: FrequencyRow[]; detail: (Omit<FrequencyRow, 'rank'> & { examples: FrequencyExample[] }) | null }
export interface FrequencyCorpus { version: number; revision: string; terms: [string, string, string, FrequencyKind][]; questions: [string, string, string, string, string, string, number | null, boolean, number][]; units: [string, number[], number[]][]; papers: string[][]; subtypes: FrequencySubtype[]; summary: FrequencySummary }
export const defaultFrequencyFilters: FrequencyFilters;
export const frequencyKinds: string[];
export const frequencyFields: string[];
export const frequencyOrders: string[];
export class FrequencyInputError extends Error {}
export function frequencyText(value?: string): string;
export function listeningTranscript(explanation: string[]): string;
export function frequencySearchText(text: string): string;
export function parseFrequencyFilters(params: URLSearchParams, metadata: FrequencyMetadata): FrequencyFilters;
export function frequencyMetadata(corpus: FrequencyCorpus): FrequencyMetadata;
export function queryFrequency(corpus: FrequencyCorpus, filters: FrequencyFilters, selectedTerm?: number): FrequencyResult;
export function frequencySubtype(question: { category: string; instruction?: string; prompt?: string; source?: string; level: string }): FrequencySubtype;
