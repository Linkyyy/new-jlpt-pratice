import { apiErrorResponse, checkApiRateLimit, HttpRequestError } from './request-limits';

/** Browser signals reduce drive-by abuse; they do not authenticate a non-browser client. */
export function checkApiOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin !== null && origin !== new URL(request.url).origin)) {
    return apiErrorResponse(new HttpRequestError(403, '不允许跨站调用此接口。'));
  }
  return null;
}

/** Run before routing, reading bodies, database requests or expensive exports. */
export function checkRequestSecurity(request: Request): Response | null {
  const url = new URL(request.url), api = url.pathname === '/api' || url.pathname.startsWith('/api/');
  if (request.url.length > 8192) return apiErrorResponse(new HttpRequestError(414, '请求地址过长。'));
  // Reject common non-application probes without invoking Next's page renderer.
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch { return apiErrorResponse(new HttpRequestError(400, '请求地址无效。')); }
  if (/(?:^|\/)\.(?:env(?:\.|\/|$)|git(?:\/|$)|svn(?:\/|$))|(?:^|\/)(?:wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin)(?:\/|$)/i.test(path)) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!api) return checkApiRateLimit(request, { scope: 'page-burst', limit: 60, windowSeconds: 10 })
    ?? checkApiRateLimit(request, { scope: 'page-total', limit: 180, windowSeconds: 60 });
  const crossSite = checkApiOrigin(request);
  if (crossSite) return crossSite;
  if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD, POST, PATCH, DELETE', 'Cache-Control': 'no-store' } });
  }
  if (Number(request.headers.get('content-length')) > 1024 * 1024) return apiErrorResponse(new HttpRequestError(413, '请求过大。'));
  return checkApiRateLimit(request, { scope: 'api-burst', limit: 40, windowSeconds: 10 })
    ?? checkApiRateLimit(request, { scope: 'api-total', limit: 240, windowSeconds: 60 });
}
