import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAMES } from '@/lib/auth/supabase-auth';

const publicPathPrefixes = ['/sign-in', '/sign-up', '/api/auth'];
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
} as const;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDemoAuthMode = process.env.WORKMATCH_AUTH_MODE === 'demo';
  const isSupabaseAuthConfigured = Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasSessionCookie = Boolean(
    request.cookies.get(AUTH_COOKIE_NAMES.accessToken)?.value || request.cookies.get(AUTH_COOKIE_NAMES.refreshToken)?.value
  );
  const hasUsableSessionCookie = isSupabaseAuthConfigured && hasSessionCookie;
  const isPublic = publicPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (isPublic) {
    if (hasUsableSessionCookie && (pathname === '/sign-in' || pathname === '/sign-up')) {
      return withSecurityHeaders(NextResponse.redirect(new URL('/', request.url)));
    }
    return withSecurityHeaders(NextResponse.next());
  }

  if (isDemoAuthMode) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!hasUsableSessionCookie) {
    if (pathname.startsWith('/api/')) {
      return withSecurityHeaders(NextResponse.json({ error: 'Authentication required.' }, { status: 401 }));
    }

    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return withSecurityHeaders(NextResponse.redirect(signInUrl));
  }

  return withSecurityHeaders(NextResponse.next());
}

function withSecurityHeaders(response: NextResponse) {
  Object.entries(securityHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|csv|xlsx?|docx?|pdf)).*)'],
};
