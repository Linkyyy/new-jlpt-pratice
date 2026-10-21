import { NextResponse, type NextRequest } from 'next/server';
import { PASSPHRASE_REQUIRED } from '@/lib/access-config.server';
import { ACTIVATION_COOKIE, verifyBrowserAccessToken } from '@/lib/browser-access.server';

export function proxy(request: NextRequest) {
  if (!PASSPHRASE_REQUIRED || verifyBrowserAccessToken(request.cookies.get(ACTIVATION_COOKIE)?.value)) return NextResponse.next();
  const target = new URL('/access', request.url);
  target.searchParams.set('returnTo', request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {matcher: ['/((?!api(?:/|$)|access(?:/|$)|_next/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp3|pdf|zip)$).*)']};
