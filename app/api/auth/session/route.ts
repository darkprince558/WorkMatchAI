import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAMES,
  AuthConfigurationError,
  AuthProviderError,
  authContextFromSupabaseUser,
  getAuthContextFromRequest,
  getSupabaseUser,
  isSupabaseAuthConfigured,
  refreshSupabaseSession,
} from '@/lib/auth';
import { setAuthCookies } from '../cookies';

export async function GET(request: Request) {
  const accessToken = readCookie(request, AUTH_COOKIE_NAMES.accessToken);
  const refreshToken = readCookie(request, AUTH_COOKIE_NAMES.refreshToken);

  if (!accessToken && !refreshToken) {
    if (process.env.WORKMATCH_AUTH_MODE === 'demo') {
      return NextResponse.json({ authenticated: true, user: getAuthContextFromRequest(request) });
    }

    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ authenticated: Boolean(accessToken), user: null });
  }

  try {
    if (accessToken) {
      const user = await getSupabaseUser(accessToken);
      return NextResponse.json({
        authenticated: true,
        user: authContextFromSupabaseUser(user),
      });
    }

    if (refreshToken) {
      return await refreshedSessionResponse(refreshToken);
    }
  } catch (error) {
    if (refreshToken) {
      return refreshedSessionResponse(refreshToken).catch(() =>
        NextResponse.json({ authenticated: false }, { status: 401 })
      );
    }

    if (error instanceof AuthConfigurationError || error instanceof AuthProviderError) {
      return NextResponse.json({ authenticated: false, error: error.message }, { status: error.status });
    }
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}

async function refreshedSessionResponse(refreshToken: string) {
  const session = await refreshSupabaseSession(refreshToken);
  const response = NextResponse.json({
    authenticated: true,
    user: session.user ? authContextFromSupabaseUser(session.user) : null,
  });
  setAuthCookies(response, session);
  return response;
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookie = cookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}
