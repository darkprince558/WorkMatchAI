import type { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAMES, type SupabaseAuthSession } from '@/lib/auth';

const thirtyDays = 60 * 60 * 24 * 30;

export function setAuthCookies(response: NextResponse, session: SupabaseAuthSession) {
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set(AUTH_COOKIE_NAMES.accessToken, session.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: session.expires_in ?? 60 * 60,
  });

  if (session.refresh_token) {
    response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, session.refresh_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: thirtyDays,
    });
  }
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAMES.accessToken, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
