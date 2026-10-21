import { NextResponse, type NextRequest } from 'next/server';
import { checkFrequencyAccess, hasFrequencyAccess } from '@/lib/frequency-access.server';
import { checkRequestSecurity } from '@/lib/request-security';

export function proxy(request: NextRequest) {
  const denied = checkRequestSecurity(request);
  if (denied) return denied;
  const path = request.nextUrl.pathname;
  if (path === '/api/frequency' || path.startsWith('/api/frequency/')) {
    return checkFrequencyAccess(request) ?? NextResponse.next();
  }
  if (!(path === '/frequency' || path.startsWith('/frequency/')) || hasFrequencyAccess(request)) return NextResponse.next();
  const target = new URL('/access', request.url);
  target.searchParams.set('returnTo', request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
// Static bundles/images remain cacheable and do not spend a Proxy invocation.
export const config = {matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)']};
