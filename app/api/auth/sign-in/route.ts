import { NextResponse } from 'next/server';
import { AuthConfigurationError, AuthProviderError, authContextFromSupabaseUser, signInWithPassword } from '@/lib/auth';
import { HttpError, readJsonObject, routeErrorResponse } from '@/lib/api/route-helpers';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/api/rate-limit';
import { setAuthCookies } from '../cookies';

const signInRateLimit = {
  limit: 8,
  windowMs: 15 * 60 * 1000,
};

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request, { maxBytes: 8 * 1024 });
    const email = normalizeEmail(body.email);
    const password = readPassword(body.password);

    const rateLimit = await checkRateLimit(`auth:sign-in:${getClientIp(request)}:${email}`, signInRateLimit);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

    const session = await signInWithPassword({ email, password });
    if (session.user) authContextFromSupabaseUser(session.user);
    const response = NextResponse.json({
      ok: true,
      user: session.user
        ? {
            id: session.user.id,
            email: session.user.email,
          }
        : undefined,
    });

    setAuthCookies(response, session);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthConfigurationError || error instanceof AuthProviderError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return routeErrorResponse(error, 'Sign in failed.');
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new HttpError(400, 'A valid email address is required.');
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'A valid email address is required.');
  }
  return email;
}

function readPassword(value: unknown) {
  if (typeof value !== 'string' || !value) throw new HttpError(400, 'Password is required.');
  if (value.length > 256) throw new HttpError(400, 'Password is too long.');
  return value;
}
