export const VISIT_ACCESS_KEY: string;
export function previousVisit(storage: Pick<Storage, 'getItem'>): boolean;
export function safeAccessReturnPath(value: unknown): string;
