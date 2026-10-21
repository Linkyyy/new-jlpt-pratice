import { PASSPHRASE_REQUIRED } from './access-config.server';
import { ACTIVATION_COOKIE, verifyBrowserAccessToken } from './browser-access.server';
import { apiErrorResponse, HttpRequestError } from './request-limits';
import { checkApiOrigin } from './request-security';

export function hasFrequencyAccess(request: Request): boolean {
  if (!PASSPHRASE_REQUIRED) return true;
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${ACTIVATION_COOKIE}=`));
  return verifyBrowserAccessToken(cookie?.slice(ACTIVATION_COOKIE.length + 1));
}

/** Keep the gate in route handlers too; exports/data must never bypass page protection. */
export function checkFrequencyAccess(request: Request): Response | null {
  return checkApiOrigin(request) ?? (hasFrequencyAccess(request) ? null : apiErrorResponse(new HttpRequestError(401, '请先输入暗号验证，再查看词频统计。')));
}
