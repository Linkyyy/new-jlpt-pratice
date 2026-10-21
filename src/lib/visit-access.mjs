export const VISIT_ACCESS_KEY = 'jlpt-practice.access.v1';
/** Only a saved access token can restore verification; practice data is unrelated. */
export function readVisitToken(storage) {
  try {
    const token = storage.getItem(VISIT_ACCESS_KEY);
    return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch { return null; }
}
export function safeAccessReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://jlpt.invalid');
    return url.origin === 'https://jlpt.invalid' && url.pathname !== '/access' ? url.pathname + url.search + url.hash : '/';
  } catch { return '/'; }
}
