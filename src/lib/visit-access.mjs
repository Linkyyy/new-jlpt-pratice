export const VISIT_ACCESS_KEY = 'jlpt-practice.access.v1';
const legacyKeys = ['jlpt-practice.study.v1', 'jlpt-practice.favorites.v1', 'jlpt-practice.preferences.v1', 'jlpt-practice.display.v1'];
/** Honor saved data from browsers that visited before the first-visit gate existed. */
export function previousVisit(storage) {
  for (const key of legacyKeys) {
    try {
      const value = JSON.parse(storage.getItem(key) ?? 'null');
      if (!value || typeof value !== 'object') continue;
      if (key.includes('.study.') && value.version === 1 && Array.isArray(value.attempts)) return true;
      if (key.includes('.favorites.') && [1, 2].includes(value.version) && Array.isArray(value.entries)) return true;
      if (key.includes('.preferences.') && value.version === 1 && value.home && value.practice) return true;
      if (key.includes('.display.') && ['zh', 'ja', 'en'].includes(value.locale) && ['system', 'light', 'dark'].includes(value.theme)) return true;
    } catch { /* Invalid/unavailable storage does not erase data or grant access. */ }
  }
  return false;
}
export function safeAccessReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://jlpt.invalid');
    return url.origin === 'https://jlpt.invalid' && url.pathname !== '/access' ? url.pathname + url.search + url.hash : '/';
  } catch { return '/'; }
}
