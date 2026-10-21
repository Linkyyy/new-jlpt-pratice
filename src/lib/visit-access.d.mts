export const VISIT_ACCESS_KEY: string;
export function readVisitToken(storage: Pick<Storage, 'getItem'>): string | null;
export function safeAccessReturnPath(value: unknown): string;
